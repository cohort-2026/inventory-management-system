
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';

import ProductForm from '../components/ProductForm';

import type {
  ProductCategory,
  ProductFormErrors,
  ProductFormValues,
} from '../components/ProductForm';

const API_BASE =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000';

type CreatedProduct = {
  product_id: string;
  name: string;
  sku: string;
};

type CreateResponse = {
  product?: CreatedProduct;
  error?: string;
};

// type CategoriesResponse =
//   | ProductCategory[]
//   | {
//       items: ProductCategory[];
//     };

export default function CreateProduct() {
  const navigate = useNavigate();

  const [categories, setCategories] =
    useState<ProductCategory[]>([]);

  const [categoriesLoading, setCategoriesLoading] =
    useState(true);

  const [categoriesError, setCategoriesError] =
    useState('');

  const [serverErrors, setServerErrors] =
    useState<ProductFormErrors>({});

  const [submitError, setSubmitError] =
    useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories(): Promise<void> {
      try {
        const response = await fetch(
          `${API_BASE}/api/categories`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Unable to load categories (HTTP ${response.status}).`,
          );
        }

        const body: unknown = await response.json();

        let items: ProductCategory[];

        if (Array.isArray(body)) {
          items = body as ProductCategory[];
        } else if (
          body !== null &&
          typeof body === 'object' &&
          'items' in body &&
          Array.isArray(body.items)
        ) {
          items = body.items as ProductCategory[];
        } else {
          throw new Error(
            'The categories API returned an unexpected response.',
          );
        }

        const validCategories = items.filter(
          (category) =>
            typeof category.category_id === 'string' &&
            typeof category.name === 'string',
        );

        if (!controller.signal.aborted) {
          setCategories(validCategories);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setCategoriesError(
          error instanceof Error
            ? error.message
            : 'Unable to load categories.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setCategoriesLoading(false);
        }
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, []);

  async function handleCreate(
    values: ProductFormValues,
  ): Promise<void> {
    setServerErrors({});
    setSubmitError('');

    const reorderLevel = Number(
      values.reorder_level,
    );

    const payload = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      category_id: values.category_id,
      unit_of_measure: values.unit_of_measure.trim(),
      reorder_level: reorderLevel,
      description: values.description.trim(),
    };

    try {
      const response = await fetch(
        `${API_BASE}/api/products`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const body: CreateResponse = await response
        .json()
        .catch(() => ({} as CreateResponse));

      if (!response.ok) {
        const message =
          typeof body.error === 'string'
            ? body.error
            : `Unable to create product (HTTP ${response.status}).`;

        if (response.status === 409) {
          setServerErrors({
            sku: message,
          });
          return;
        }

        if (response.status === 400) {
          const lowerMessage = message.toLowerCase();

          if (lowerMessage.includes('category')) {
            setServerErrors({
              category_id: message,
            });
          } else if (lowerMessage.includes('sku')) {
            setServerErrors({
              sku: message,
            });
          } else if (lowerMessage.includes('name')) {
            setServerErrors({
              name: message,
            });
          } else if (lowerMessage.includes('reorder')) {
            setServerErrors({
              reorder_level: message,
            });
          } else if (lowerMessage.includes('unit')) {
            setServerErrors({
              unit_of_measure: message,
            });
          } else {
            setSubmitError(message);
          }

          return;
        }

        setSubmitError(message);
        return;
      }

      if (response.status !== 201 ||
          !body.product?.product_id) {
        setSubmitError(
          'Product creation returned an unexpected response.',
        );
        return;
      }

      // The details page currently contains mock data.
      // Redirect to the live Product List until
      // GET /api/products/:id is integrated.
      navigate('/product_list', {
        replace: true,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Unable to create product.',
      );
    }
  }

  return (
    <AppLayout>
      <PageHeader
        breadcrumb="Products / New Product"
        title="Create Product"
      />

      {categoriesError && (
        <p
          role="alert"
          className="field-error"
          style={{
            marginBottom: 'var(--space-4)',
          }}
        >
          {categoriesError}
        </p>
      )}

      {!categoriesLoading &&
       !categoriesError &&
       categories.length === 0 && (
        <p
          role="alert"
          className="field-error"
          style={{
            marginBottom: 'var(--space-4)',
          }}
        >
          No categories are available.
          A category is required to create a product.
        </p>
      )}

      <ProductForm
        mode="create"
        categories={categories}
        categoriesLoading={
          categoriesLoading ||
          !!categoriesError ||
          categories.length === 0
        }
        cancelTo="/product_list"
        onSave={handleCreate}
        serverErrors={serverErrors}
        submitError={submitError}
      />
    </AppLayout>
  );
}

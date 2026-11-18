
import { useEffect, useRef, useState } from 'react';

import ProductForm from './ProductForm';

import type {
  ProductCategory,
  ProductFormErrors,
  ProductFormValues,
} from './ProductForm';

import { createPortal } from 'react-dom';

export type EditableProduct = {
  product_id: string;
  category_id: string;
  name: string;
  sku: string;
  description: string | null;
  unit_of_measure: string;
  reorder_level: string | number;
  status: 'active' | 'archived';
};

type EditProductModalProps = {
  product: EditableProduct;
  categories: ProductCategory[];
  onClose: () => void;
  onSaved: () => void;
  categoriesLoading?: boolean;
  categoriesError?: string;
};

type ApiResponse = {
  product?: EditableProduct;
  error?: string;
};

const API_BASE =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000';

function getFieldError(message: string): ProductFormErrors {
  const text = message.toLowerCase();

  if (text.includes('sku')) {
    return { sku: message };
  }

  if (text.includes('category')) {
    return { category_id: message };
  }

  if (text.includes('name')) {
    return { name: message };
  }

  if (text.includes('reorder')) {
    return { reorder_level: message };
  }

  if (text.includes('unit')) {
    return { unit_of_measure: message };
  }

  if (text.includes('description')) {
    return { description: message };
  }

  return {};
}

export default function EditProductModal({
  product,
  categories,
  onClose,
  onSaved,
  categoriesLoading = false,
  categoriesError = '',
}: EditProductModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [serverErrors, setServerErrors] =
    useState<ProductFormErrors>({});

  const [submitError, setSubmitError] = useState('');

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  const initialValues: ProductFormValues = {
    name: product.name,
    sku: product.sku,
    category_id: product.category_id,
    unit_of_measure: product.unit_of_measure,
    reorder_level: String(product.reorder_level),
    description: product.description ?? '',
  };

  function closeModal() {
    if (savingRef.current) return;

    onClose();
  }

  async function handleSave(
    values: ProductFormValues,
  ): Promise<void> {
    setServerErrors({});
    setSubmitError('');

    const payload = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      category_id: values.category_id,
      unit_of_measure: values.unit_of_measure.trim(),
      reorder_level: Number(values.reorder_level),
      description: values.description.trim(),
    };

    try {
      const response = await fetch(
        `${API_BASE}/api/products/${encodeURIComponent(product.product_id)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const body: ApiResponse = await response
        .json()
        .catch(() => ({} as ApiResponse));

      if (!response.ok) {
        const message =
          typeof body.error === 'string'
            ? body.error
            : `Unable to update product (HTTP ${response.status}).`;

        if (response.status === 409) {
          setServerErrors({ sku: message });
          return;
        }

        if (response.status === 400) {
          const fieldErrors = getFieldError(message);

          if (Object.keys(fieldErrors).length > 0) {
            setServerErrors(fieldErrors);
          } else {
            setSubmitError(message);
          }

          return;
        }

        setSubmitError(message);
        return;
      }

      if (response.status !== 200 && response.status !== 204) {
        setSubmitError(
          'The server returned an unexpected update response.',
        );
        return;
      }

      // The server accepted the update.
      // The parent will refetch the product list.
      onSaved();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Unable to update product.',
      );
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="edit-product-dialog"
      aria-labelledby="edit-product-title"
      onCancel={(event) => {
        event.preventDefault();
        closeModal();
      }}
    >
      <div className="page-header edit-product-dialog-header">
        <div className="edit-product-dialog-heading">
          <p className="breadcrumb">Products / Edit Product</p>
          <h2 id="edit-product-title" className="page-title">
            Edit Product
          </h2>
          <p className="page-subtitle">Editing {product.name}</p>
        </div>

        <button
          type="button"
          className="btn btn-secondary edit-product-dialog-close"
          aria-label="Close Edit Product"
          disabled={saving}
          onClick={closeModal}
        >
          ✕
        </button>
      </div>

      {categoriesError && (
        <p role="alert" className="field-error edit-product-dialog-error">
          Unable to load categories: {categoriesError}
        </p>
      )}

      <ProductForm
        mode="edit"
        compact
        initialValues={initialValues}
        categories={categories}
        cancelTo="/product_list"
        onCancel={closeModal}
        onSave={handleSave}
        onSavingChange={(value) => {
          savingRef.current = value;
          setSaving(value);
        }}
        onFieldChange={() => {
          setServerErrors({});
          setSubmitError('');
        }}
        serverErrors={serverErrors}
        submitError={submitError}
        categoriesLoading={
          categoriesLoading || !!categoriesError || categories.length === 0
        }
      />
    </dialog>,
    document.body,
  );
}

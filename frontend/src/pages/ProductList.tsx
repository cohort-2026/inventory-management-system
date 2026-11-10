
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import EditProductModal from '../components/EditProductModal';
import type {
  EditableProduct,
} from '../components/EditProductModal';
import type {
  ProductCategory,
} from '../components/ProductForm';

type Product = {
  product_id: string;
  category_id: string;
  name: string;
  sku: string;
  description: string | null;
  unit_of_measure: string;
  reorder_level: string | number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
};

type ProductListResponse = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};

type StatusFilter = 'active' | 'archived' | 'all';

const API_URL =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000';

const PAGE_SIZE = 20;

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] =
    useState<StatusFilter>('active');

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedProduct, setSelectedProduct] =
  useState<EditableProduct | null>(null);

  const [categories, setCategories] =
    useState<ProductCategory[]>([]);

  const [categoriesError, setCategoriesError] = useState('');

  const [categoriesLoading, setCategoriesLoading] =
    useState(true);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      setCategoriesLoading(true);
      setCategoriesError('');

      try {
        const response = await fetch(
          `${API_URL}/api/categories`,
          {
            credentials: 'include',
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Unable to load categories (HTTP ${response.status}).`,
          );
        }

        const data: unknown = await response.json();

        if (
          !data ||
          typeof data !== 'object' ||
          !('items' in data) ||
          !Array.isArray(data.items)
        ) {
          throw new Error('Unexpected categories response.');
        }

        const validCategories = data.items.filter(
          (item): item is ProductCategory =>
            item !== null &&
            typeof item === 'object' &&
            typeof item.category_id === 'string' &&
            typeof item.name === 'string',
        );

        if (!controller.signal.aborted) {
          setCategories(validCategories);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setCategoriesError(
            error instanceof Error
              ? error.message
              : 'Unable to load categories.',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setCategoriesLoading(false);
        }
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      const trimmedSearch = search.trim();

      if (trimmedSearch) {
        params.set('search', trimmedSearch);
      }

      if (status === 'active') {
        params.set('status', 'active');
      } else if (status === 'archived') {
        params.set('status', 'archived');
      } else {
        params.set('includeArchived', 'true');
      }

      try {
        const response = await fetch(
          `${API_URL}/api/products?${params.toString()}`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          },
        );

        const body: unknown =
          await response.json().catch(() => ({}));

        if (!response.ok) {
          const serverError =
            body &&
            typeof body === 'object' &&
            'error' in body &&
            typeof body.error === 'string'
              ? body.error
              : `Unable to load products (HTTP ${response.status}).`;

          throw new Error(serverError);
        }

        const data = body as ProductListResponse;

        if (
          !Array.isArray(data.items) ||
          typeof data.total !== 'number'
        ) {
          throw new Error(
            'The products API returned an unexpected response.',
          );
        }

        if (!controller.signal.aborted) {
          setProducts(data.items);
          setTotal(data.total);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        setProducts([]);
        setTotal(0);

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load products.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      controller.abort();
    };
  }, [page, search, status, refreshKey]);

  const totalPages = Math.max(
    1,
    Math.ceil(total / PAGE_SIZE),
  );

  const firstItem =
    total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;

  const lastItem = Math.min(
    page * PAGE_SIZE,
    total,
  );

  function resetFilters() {
    setSearch('');
    setStatus('active');
    setPage(1);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Products"
        actions={
          <Link
            to="/products/new"
            className="btn btn-primary"
          >
            + Create Product
          </Link>
        }
      />

      <div
        className="filter-bar"
        role="search"
      >
        <div style={{ flex: '1 1 260px' }}>
          <label
            className="field-label"
            htmlFor="product-search"
          >
            Search products
          </label>

          <input
            id="product-search"
            className="field-input"
            type="search"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div style={{ minWidth: 180 }}>
          <label
            className="field-label"
            htmlFor="product-status"
          >
            Product status
          </label>

          <select
            id="product-status"
            className="field-select"
            value={status}
            onChange={(event) => {
              setStatus(
                event.target.value as StatusFilter,
              );
              setPage(1);
            }}
          >
            <option value="active">
              Active
            </option>
            <option value="archived">
              Archived
            </option>
            <option value="all">
              All statuses
            </option>
          </select>
        </div>

        <div style={{ alignSelf: 'end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetFilters}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {error && (
        <p
          className="field-error"
          role="alert"
          style={{
            marginBottom: 'var(--space-4)',
          }}
        >
          {error}
        </p>
      )}

      {loading ? (
        <div
          className="card card-body"
          role="status"
          aria-live="polite"
        >
          Loading products...
        </div>
      ) : !error ? (
        <>
        <p className="table-note">
          Categories loading: {String(categoriesLoading)} |
          Categories loaded: {categories.length} |
          Categories error: {categoriesError || 'None'}
        </p>
          <DataTable
            columns={[
              {
                header: 'Product',
                render: (product) => product.name,
              },
              {
                header: 'SKU',
                render: (product) => product.sku,
                mono: true,
              },
              {
                header: 'Category ID',
                render: (product) =>
                  product.category_id,
                mono: true,
              },
              {
                header: 'Unit',
                render: (product) =>
                  product.unit_of_measure,
              },
              {
                header: 'Reorder Level',
                render: (product) =>
                  product.reorder_level,
                mono: true,
              },
              {
                header: 'Status',
                render: (product) =>
                  product.status === 'active'
                    ? 'Active'
                    : 'Archived',
              },
              {
                header: 'Actions',
                render: (product) => (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedProduct(product)}
                  >
                    Edit
                  </button>
                )
              },
            ]
          }
            rows={products}
            keyField={(product) =>
              product.product_id
            }
          />

          {products.length === 0 && (
            <p
              className="table-empty"
              role="status"
            >
              No products match your search
              or selected filters.
            </p>
          )}

          <p className="table-note">
            Showing {firstItem}–{lastItem} of {total}
          </p>

          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
          />
        </>
      ) : null}
      {selectedProduct && (
        <EditProductModal
          key={selectedProduct.product_id}
          product={selectedProduct}
          categories={categories}
          categoriesLoading={categoriesLoading}
          categoriesError={categoriesError}
          onClose={() => setSelectedProduct(null)}
          onSaved={() => {
            setSelectedProduct(null);
            setRefreshKey((current) => current + 1);
          }}
        />
      )}
    </AppLayout>
  );
}
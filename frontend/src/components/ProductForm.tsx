
import {
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  FormEvent,
} from 'react';

import { Link } from 'react-router-dom';

import Card from './Card';

export type ProductFormValues = {
  name: string;
  sku: string;
  category_id: string;
  unit_of_measure: string;
  reorder_level: string;
  description: string;
};

export type ProductCategory = {
  category_id: string;
  name: string;
};

export type ProductFormField =
  keyof ProductFormValues;

export type ProductFormErrors =
  Partial<Record<ProductFormField, string>>;

type ProductFormProps = {
  mode: 'create' | 'edit';
  initialValues?: ProductFormValues;
  categories: ProductCategory[];
  categoriesLoading?: boolean;
  cancelTo: string;
  onSave: (values: ProductFormValues) => Promise<void>;
  serverErrors?: ProductFormErrors;
  submitError?: string;
  compact?: boolean;
  onCancel?: () => void;
  onSavingChange?: (saving: boolean) => void;
  onFieldChange?: () => void;
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  sku: '',
  category_id: '',
  unit_of_measure: 'each',
  reorder_level: '0',
  description: '',
};

const FIELD_ORDER: ProductFormField[] = [
  'name',
  'sku',
  'category_id',
  'unit_of_measure',
  'reorder_level',
  'description',
];

function validate(
  values: ProductFormValues,
  categories: ProductCategory[],
): ProductFormErrors {
  const errors: ProductFormErrors = {};

  if (!values.name.trim()) {
    errors.name = 'Product name is required.';
  }

  if (!values.sku.trim()) {
    errors.sku = 'SKU is required.';
  }

  if (!values.category_id) {
    errors.category_id = 'Select a category.';
  } else if (
    !categories.some(
      (category) =>
        category.category_id === values.category_id,
    )
  ) {
    errors.category_id = 'Select a valid category.';
  }

  if (!values.unit_of_measure.trim()) {
    errors.unit_of_measure =
      'Unit of measure is required.';
  }

  const level = Number(values.reorder_level);

  if (
    !values.reorder_level.trim() ||
    !Number.isFinite(level) ||
    level < 0
  ) {
    errors.reorder_level =
      'Reorder level must be a non-negative number.';
  }

  return errors;
}

export default function ProductForm({
  mode,
  initialValues = EMPTY_PRODUCT_FORM,
  categories,
  categoriesLoading = false,
  cancelTo,
  onSave,
  serverErrors = {},
  submitError,
  compact = false,
  onCancel,
  onSavingChange,
  onFieldChange,
}: ProductFormProps) {
  const [values, setValues] =
    useState<ProductFormValues>(initialValues);

  const [clientErrors, setClientErrors] =
    useState<ProductFormErrors>({});

  const [saving, setSaving] = useState(false);

  const savingRef = useRef(false);

  const fieldRefs = useRef<
    Partial<
      Record<
        ProductFormField,
        HTMLInputElement |
        HTMLSelectElement |
        HTMLTextAreaElement
      >
    >
  >({});

  const errors: ProductFormErrors = {
    ...clientErrors,
    ...serverErrors,
  };

  function focusFirstError(
    currentErrors: ProductFormErrors,
  ): void {
    const first = FIELD_ORDER.find(
      (field) => !!currentErrors[field],
    );

    if (first) {
      fieldRefs.current[first]?.focus();
    }
  }

  useEffect(() => {
    if (Object.keys(serverErrors).length > 0) {
      focusFirstError(serverErrors);
    }
  }, [serverErrors]);

  function updateField(
    field: ProductFormField,
    value: string,
  ): void {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));

    setClientErrors((current) => ({
      ...current,
      [field]: undefined,
    }));

    onFieldChange?.();
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (savingRef.current || categoriesLoading) {
      return;
    }

    const nextErrors = validate(
      values,
      categories,
    );

    setClientErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }

    const cleanedValues: ProductFormValues = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      category_id: values.category_id,
      unit_of_measure: values.unit_of_measure.trim(),
      reorder_level: values.reorder_level.trim(),
      description: values.description.trim(),
    };

    savingRef.current = true;
    setSaving(true);
    onSavingChange?.(true);
    try {
      await onSave(cleanedValues);
    } finally {
      savingRef.current = false;
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  function fieldError(
    field: ProductFormField,
  ) {
    return errors[field] ? (
      <p
        id={`${field}-error`}
        className="field-error"
        role="alert"
      >
        {errors[field]}
      </p>
    ) : null;
  }

  function describedBy(
    field: ProductFormField,
  ): string | undefined {
    return errors[field]
      ? `${field}-error`
      : undefined;
  }

  return (
    <div className={compact ? '' : 'form-with-sidebar'}>
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        noValidate
      >
        <h3 className="form-section-title">
          Basic Information
        </h3>

        <div className="field">
          <label
            className="field-label"
            htmlFor="product-name"
          >
            Product Name *
          </label>

          <input
            ref={(element) => {
              if (element) {
                fieldRefs.current.name = element;
              }
            }}
            id="product-name"
            className="field-input"
            value={values.name}
            onChange={(event) =>
              updateField('name', event.target.value)
            }
            placeholder="e.g. Dell Latitude 5440"
            required
            aria-invalid={!!errors.name}
            aria-describedby={describedBy('name')}
          />

          {fieldError('name')}
        </div>

        <div className="field">
          <label
            className="field-label"
            htmlFor="product-sku"
          >
            SKU *
          </label>

          <input
            ref={(element) => {
              if (element) {
                fieldRefs.current.sku = element;
              }
            }}
            id="product-sku"
            className="field-input"
            value={values.sku}
            onChange={(event) =>
              updateField('sku', event.target.value)
            }
            placeholder="e.g. LAP-DELL-5440-001"
            required
            aria-invalid={!!errors.sku}
            aria-describedby={describedBy('sku')}
          />

          {fieldError('sku')}
        </div>

        <div className="field-row">
          <div className="field">
            <label
              className="field-label"
              htmlFor="product-category"
            >
              Category *
            </label>

            <select
              ref={(element) => {
                if (element) {
                  fieldRefs.current.category_id = element;
                }
              }}
              id="product-category"
              className="field-select"
              value={values.category_id}
              onChange={(event) =>
                updateField(
                  'category_id',
                  event.target.value,
                )
              }
              required
              disabled={categoriesLoading}
              aria-invalid={!!errors.category_id}
              aria-describedby={describedBy('category_id')}
            >
              <option value="">
                {categoriesLoading
                  ? 'Loading categories...'
                  : 'Select category'}
              </option>

              {categories.map((category) => (
                <option
                  key={category.category_id}
                  value={category.category_id}
                >
                  {category.name}
                </option>
              ))}
            </select>

            {fieldError('category_id')}
          </div>

          <div className="field">
            <label
              className="field-label"
              htmlFor="product-unit"
            >
              Unit of Measure *
            </label>

            <select
              ref={(element) => {
                if (element) {
                  fieldRefs.current.unit_of_measure = element;
                }
              }}
              id="product-unit"
              className="field-select"
              value={values.unit_of_measure}
              onChange={(event) =>
                updateField(
                  'unit_of_measure',
                  event.target.value,
                )
              }
              required
              aria-invalid={!!errors.unit_of_measure}
              aria-describedby={describedBy('unit_of_measure')}
            >
              <option value="each">Each</option>
              <option value="box">Box</option>
              <option value="case">Case</option>
            </select>

            {fieldError('unit_of_measure')}
          </div>
        </div>

        <div className="field">
          <label
            className="field-label"
            htmlFor="product-reorder"
          >
            Reorder Level
          </label>

          <input
            ref={(element) => {
              if (element) {
                fieldRefs.current.reorder_level = element;
              }
            }}
            id="product-reorder"
            className="field-input"
            type="number"
            min="0"
            step="any"
            value={values.reorder_level}
            onChange={(event) =>
              updateField(
                'reorder_level',
                event.target.value,
              )
            }
            aria-invalid={!!errors.reorder_level}
            aria-describedby={describedBy('reorder_level')}
          />

          {fieldError('reorder_level')}
        </div>

        <div className="field">
          <label
            className="field-label"
            htmlFor="product-description"
          >
            Description
          </label>

          <textarea
            ref={(element) => {
              if (element) {
                fieldRefs.current.description = element;
              }
            }}
            id="product-description"
            className="field-textarea"
            value={values.description}
            onChange={(event) =>
              updateField(
                'description',
                event.target.value,
              )
            }
            aria-invalid={!!errors.description}
            aria-describedby={describedBy('description')}
          />

          {fieldError('description')}
        </div>

        {submitError && (
          <p
            className="field-error"
            role="alert"
            style={{
              marginBottom: 'var(--space-3)',
            }}
          >
            {submitError}
          </p>
        )}

        <div className="page-actions">
          {onCancel ? (
            <button
                type="button"
                className="btn btn-secondary"
                onClick={onCancel}
                disabled={saving}
            >
                Cancel
            </button>
            ) : (
            <Link to={cancelTo} className="btn btn-secondary">
                Cancel
            </Link>
            )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || categoriesLoading}
          >
            {saving
              ? 'Saving...'
              : mode === 'create'
                ? 'Create Product'
                : 'Save Changes'}
          </button>
        </div>
      </form>

      {!compact && (
        <Card title="Validation">
            <ul className="validation-list">
            <li>Product name required</li>
            <li>SKU required and unique</li>
            <li>Category required</li>
            <li>Reorder level must be valid</li>
            <li>Reorder level ≥ 0</li>
            </ul>
        </Card>
        )}
    </div>
  );
}

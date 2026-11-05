import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import { useAuth } from '../utils/AuthContext';
import type { ProductOption, LocationOption } from '../services/api';
import {
  fetchAllTransferInventory,
  fetchTransferOptions,
  submitStockTransfer,
  TransferApiError,
} from '../services/transferStockApi';
import type { TransferInventoryRow, TransferResult } from '../services/transferStockApi';

type Step = 'form' | 'review' | 'done';
type FormErrors = Partial<Record<'product' | 'from' | 'to' | 'quantity' | 'note', string>>;

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error. Please try again.';
}

// Compare positive decimal strings exactly, without float rounding.
function validPositiveDecimal(text: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) && /[1-9]/.test(text) && text.length <= 100;
}
function normalizedDecimal(text: string): [string, string] {
  const [whole = '0', fraction = ''] = text.split('.');
  return [whole.replace(/^0+(?=\d)/, ''), fraction.replace(/0+$/, '')];
}
function compareDecimal(a: string, b: string): number {
  const [aw, af] = normalizedDecimal(a);
  const [bw, bf] = normalizedDecimal(b);
  if (aw.length !== bw.length) return aw.length > bw.length ? 1 : -1;
  if (aw !== bw) return aw > bw ? 1 : -1;
  const length = Math.max(af.length, bf.length);
  return af.padEnd(length, '0').localeCompare(bf.padEnd(length, '0'));
}
function addDecimal(a: string, b: string, subtract = false): string {
  const [, af] = normalizedDecimal(a);
  const [, bf] = normalizedDecimal(b);
  const scale = Math.max(af.length, bf.length);
  const toInt = (s: string) => {
    const [whole, frac] = normalizedDecimal(s);
    return BigInt(whole + frac.padEnd(scale, '0'));
  };
  const result = subtract ? toInt(a) - toInt(b) : toInt(a) + toInt(b);
  const negative = result < 0n;
  const digits = (negative ? -result : result).toString().padStart(scale + 1, '0');
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fractional = scale ? digits.slice(-scale).replace(/0+$/, '') : '';
  return `${negative ? '-' : ''}${whole}${fractional ? '.' + fractional : ''}`;
}

export default function TransferStock() {
  const { user } = useAuth();
  const canTransfer = user?.roleName === 'Manager' || user?.roleName === 'Inventory Staff';
  const [step, setStep] = useState<Step>('form');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [inventory, setInventory] = useState<TransferInventoryRow[]>([]);
  const [productId, setProductId] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<TransferResult | null>(null);
  const submitting = useRef(false);

  const load = useCallback(async (reloadOptions: boolean) => {
    setLoading(true);
    setError('');
    try {
      if (reloadOptions) {
        const [opts, records] = await Promise.all([fetchTransferOptions(), fetchAllTransferInventory()]);
        setProducts(opts.products);
        setLocations(opts.locations);
        setInventory(records);
      } else {
        setInventory(await fetchAllTransferInventory());
      }
      return true;
    } catch (caught) {
      setError(readableError(caught));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canTransfer) void load(true);
  }, [canTransfer, load]);

  const selectedProduct = products.find((p) => p.product_id === productId);
  const fromLocation = locations.find((l) => l.location_id === fromId);
  const toLocation = locations.find((l) => l.location_id === toId);
  const stockAt = (locationId: string): string =>
    inventory.find((record) => record.product_id === productId && record.location_id === locationId)?.quantity ?? '0';
  const fromBefore = stockAt(fromId);
  const toBefore = stockAt(toId);
  const amountValid = validPositiveDecimal(quantity);
  const tooMuch = Boolean(fromId && amountValid && compareDecimal(quantity, fromBefore) > 0);
  const fromAfter = productId && fromId && amountValid && !tooMuch ? addDecimal(fromBefore, quantity, true) : '—';
  const toAfter = productId && toId && amountValid ? addDecimal(toBefore, quantity) : '—';

  const blockingError = useMemo(() => {
    if (!products.length) return 'No active products are available.';
    if (locations.length < 2) return 'Two active locations are required to transfer stock.';
    return '';
  }, [locations.length, products.length]);

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!productId || !selectedProduct) next.product = 'Select a product.';
    if (!fromId || !fromLocation) next.from = 'Select a source location.';
    if (!toId || !toLocation) next.to = 'Select a destination location.';
    if (fromId && toId && fromId === toId) next.to = 'Source and destination must be different.';
    if (!validPositiveDecimal(quantity)) next.quantity = 'Enter a positive decimal quantity.';
    else if (fromId && tooMuch) next.quantity = `Cannot transfer ${quantity}; only ${fromBefore} in stock at this location.`;
    if (note.trim().length > 2000) next.note = 'Notes must be 2,000 characters or fewer.';
    return next;
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;
    // Refresh immediately before presenting the review to avoid a stale preview.
    const loaded = await load(false);
    if (!loaded) return;
    setStep('review');
  }

  async function confirm() {
    if (submitting.current || saving || loading) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await submitStockTransfer({
        product_id: productId,
        from_location_id: fromId,
        to_location_id: toId,
        quantity,
        note: note.trim() || null,
      });
      setSuccess(result);
      setStep('done');
    } catch (caught) {
      const message = readableError(caught);
      setError(message);
      if (caught instanceof TransferApiError && caught.status === 409) {
        // A conflict may mean the source balance changed during review.
        // Refresh the preview, leave the form fields intact, and allow Back.
        try {
          setInventory(await fetchAllTransferInventory());
        } catch (refreshError) {
          setError(`${message} Stock refresh failed: ${readableError(refreshError)}`);
        }
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (!canTransfer) {
    return (
      <AppLayout>
        <PageHeader title="Transfer Stock" />
        <p role="alert" className="field-error">You do not have permission to transfer stock.</p>
        <Link to="/inventory_overview" className="btn btn-secondary">Return to inventory</Link>
      </AppLayout>
    );
  }

  const fieldError = (field: keyof FormErrors) => errors[field];
  return (
    <AppLayout>
      <PageHeader title="Transfer Stock" subtitle="Move stock between locations in two steps." />
      <div aria-label="Transfer progress" className="field-hint" style={{ marginBottom: 'var(--space-4)' }}>
        {step === 'form' ? 'Step 1 of 2 — Enter details' : step === 'review' ? 'Step 2 of 2 — Review and confirm' : 'Transfer complete'}
      </div>
      {error && <p role="alert" className="field-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</p>}
      {loading && <p role="status">Loading inventory…</p>}
      {!loading && blockingError && step !== 'done' && <p role="alert" className="field-error">{blockingError}</p>}

      {step === 'form' && !loading && !blockingError && (
        <div className="form-with-sidebar">
          <form onSubmit={(event) => void review(event)} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="transfer-product">Product *</label>
              <select id="transfer-product" className="field-select" value={productId} onChange={(e) => { setProductId(e.target.value); setErrors({}); }} aria-invalid={Boolean(fieldError('product'))} aria-describedby={fieldError('product') ? 'transfer-product-error' : undefined} required>
                <option value="">Select a product</option>
                {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} ({p.sku})</option>)}
              </select>
              {fieldError('product') && <p id="transfer-product-error" className="field-error" role="alert">{fieldError('product')}</p>}
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="transfer-from">From location *</label>
                <select id="transfer-from" className="field-select" value={fromId} onChange={(e) => { setFromId(e.target.value); setErrors({}); }} aria-invalid={Boolean(fieldError('from'))} aria-describedby={fieldError('from') ? 'transfer-from-error' : 'transfer-source-hint'} required>
                  <option value="">Select source</option>
                  {locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
                </select>
                {fieldError('from') && <p id="transfer-from-error" role="alert" className="field-error">{fieldError('from')}</p>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="transfer-to">To location *</label>
                <select id="transfer-to" className="field-select" value={toId} onChange={(e) => { setToId(e.target.value); setErrors({}); }} aria-invalid={Boolean(fieldError('to'))} aria-describedby={fieldError('to') ? 'transfer-to-error' : undefined} required>
                  <option value="">Select destination</option>
                  {locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
                </select>
                {fieldError('to') && <p id="transfer-to-error" role="alert" className="field-error">{fieldError('to')}</p>}
              </div>
            </div>
            <p className="field-hint" id="transfer-source-hint" style={{ marginBottom: 'var(--space-4)' }}>Available at source: <span className="mono">{productId && fromId ? fromBefore : '—'}</span></p>
            <div className="field">
              <label className="field-label" htmlFor="transfer-quantity">Quantity *</label>
              <input id="transfer-quantity" className="field-input" type="text" inputMode="decimal" value={quantity} onChange={(e) => { setQuantity(e.target.value); setErrors({}); }} aria-invalid={Boolean(fieldError('quantity'))} aria-describedby={fieldError('quantity') ? 'transfer-quantity-error' : 'transfer-quantity-hint'} required />
              <p id="transfer-quantity-hint" className="field-hint">Enter a positive quantity. Decimals are supported.</p>
              {fieldError('quantity') && <p id="transfer-quantity-error" className="field-error" role="alert">{fieldError('quantity')}</p>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="transfer-note">Note (optional)</label>
              <textarea id="transfer-note" className="field-textarea" maxLength={2000} value={note} onChange={(e) => { setNote(e.target.value); setErrors({}); }} aria-invalid={Boolean(fieldError('note'))} aria-describedby={fieldError('note') ? 'transfer-note-error' : undefined} />
              {fieldError('note') && <p id="transfer-note-error" className="field-error" role="alert">{fieldError('note')}</p>}
            </div>
            <div className="page-actions" style={{ flexWrap: 'wrap' }}>
              <Link to="/inventory_overview" className="btn btn-secondary">Cancel</Link>
              <button className="btn btn-primary" type="submit">Review transfer</button>
            </div>
          </form>
          <Card title="Stock preview">
            <div className="transfer-box">
              <p className="transfer-box-label">{fromLocation?.name ?? 'Source location'}</p>
              <p className="transfer-box-value">{productId && fromId ? fromBefore : '—'} → {fromAfter}</p>
            </div>
            <p className="transfer-arrow">↓</p>
            <div className="transfer-box">
              <p className="transfer-box-label">{toLocation?.name ?? 'Destination location'}</p>
              <p className="transfer-box-value">{productId && toId ? toBefore : '—'} → {toAfter}</p>
            </div>
            {tooMuch && <p className="field-error" role="alert">Only {fromBefore} available at the source.</p>}
          </Card>
        </div>
      )}

      {step === 'review' && (
        <div className="form-with-sidebar">
          <section className="card" aria-label="Review transfer">
            <div className="card-body">
              <h2 className="form-section-title">Review before confirming</h2>
              <p><strong>Product:</strong> {selectedProduct?.name} ({selectedProduct?.sku})</p>
              <p><strong>Quantity:</strong> <span className="mono">{quantity}</span></p>
              <p><strong>From:</strong> {fromLocation?.name}</p>
              <p><strong>To:</strong> {toLocation?.name}</p>
              {note.trim() && <p><strong>Note:</strong> {note.trim()}</p>}
              <div className="transfer-box" style={{ marginTop: 'var(--space-4)' }}><p className="transfer-box-label">Source — {fromLocation?.name}</p><p className="transfer-box-value">{fromBefore} → {fromAfter}</p></div>
              <div className="transfer-box"><p className="transfer-box-label">Destination — {toLocation?.name}</p><p className="transfer-box-value">{toBefore} → {toAfter}</p></div>
              {tooMuch && <p role="alert" className="field-error">Stock has changed. Only {fromBefore} is currently available. Go back and revise the quantity.</p>}
              <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>These quantities are a preview; the backend checks available stock again at confirmation.</p>
              <div className="page-actions" style={{ flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" type="button" disabled={saving || loading} onClick={() => { setStep('form'); setError(''); }}>Back</button>
                <button className="btn btn-primary" type="button" disabled={saving || loading || tooMuch} onClick={() => void confirm()}>{saving ? 'Transferring…' : 'Confirm transfer'}</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {step === 'done' && success && (
        <section className="card" aria-label="Transfer confirmation">
          <div className="card-body">
            <h2 className="form-section-title">Transfer successful</h2>
            <p role="status">{success.quantity_transferred} units transferred from {fromLocation?.name} to {toLocation?.name}.</p>
            <div className="transfer-box" style={{ marginTop: 'var(--space-4)' }}><p className="transfer-box-label">Source — {fromLocation?.name}</p><p className="transfer-box-value">{success.source.quantity_before} → {success.source.quantity_after}</p></div>
            <div className="transfer-box"><p className="transfer-box-label">Destination — {toLocation?.name}</p><p className="transfer-box-value">{success.destination.quantity_before} → {success.destination.quantity_after}</p></div>
            <p className="field-hint">Transfer reference: <span className="mono">{success.reference_id}</span></p>
            <div className="page-actions" style={{ flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
              <Link to="/inventory_overview" className="btn btn-primary">View inventory</Link>
              <button className="btn btn-secondary" type="button" onClick={() => { setStep('form'); setSuccess(null); setQuantity(''); setNote(''); void load(false); }}>New transfer</button>
            </div>
          </div>
        </section>
      )}
    </AppLayout>
  );
}


const API_BASE_URL = `${import.meta.env.VITE_API_URL ?? "http://localhost:5000"}/api`;

export interface InventoryRecord {
  inventory_id: string | null;
  product_id: string;
  location_id: string;
  quantity: number;
  product_name: string;
  product_sku: string;
  location_name: string;
}

export type InventoryStockStatus =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK";

export interface InventoryPageRecord {
  id: string;
  inventory_id: string | null;
  product_id: string;
  location_id: string;
  name: string;
  sku: string;
  category_id: string | null;
  category_name: string;
  location_name: string;
  location_code: string;
  quantity: string;
  reorder_level: string;
  stock_status: InventoryStockStatus;
  status: string;
  updated_at: string | null;
  last_movement_at: string | null;
}

export interface InventoryPageResponse {
  items: InventoryPageRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface InventorySummary {
  total: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
}

export interface InventoryFilters {
  search?: string;
  location?: string;
  category?: string;
  status?: InventoryStockStatus | "";
  page?: number;
  pageSize?: number;
  selected?: string[];
}

export interface ProductOption {
  product_id: string;
  name: string;
  sku: string;
}

export interface ProductDetail {
  product_id: string;
  category_id: string;
  category_name: string | null;
  name: string;
  sku: string;
  description: string | null;
  unit_of_measure: string;
  reorder_level: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProductLocationStock {
  location_id: string;
  location_name: string;
  location_code: string;
  quantity: string;
}

export interface ProductRecentMovement {
  movement_id: string;
  movement_no: string | null;
  movement_type: string;
  quantity_change: string;
  quantity_before: string;
  quantity_after: string;
  reference_no: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  location_name: string | null;
  user_name: string | null;
}

export interface ProductDetailResponse {
  product: ProductDetail;
  summary: {
    total_on_hand: string;
    last_received_at: string | null;
    last_count_at: string | null;
  };
  locations: ProductLocationStock[];
  recent_movements: ProductRecentMovement[];
}

export interface LocationOption {
  location_id: string;
  name: string;
  code: string;
  status: string;
}

export type StockMovementType =
  | "RECEIPT"
  | "SALE"
  | "CUSTOMER_RETURN"
  | "WRITE_OFF"
  | "ADJUSTMENT";

export interface ReasonCode {
  reason_code_id: string;
  movement_type: StockMovementType;
  code: string;
  label: string;
  requires_note: boolean;
}

export interface CreateStockMovementInput {
  product_id: string;
  location_id: string;
  movement_type: StockMovementType;
  quantity: string;
  reason_code_id: string;
  direction?: "increase" | "decrease";
  reference_no?: string;
  notes?: string;
}

export interface StockMovementResult {
  movement: Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

async function request(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
  });

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      isObject(data) && typeof data.error === "string"
        ? data.error
        : `Request failed. HTTP ${response.status}`;

    throw new Error(message);
  }

  return data;
}

/**
 * Builds query parameters for the inventory endpoints.
 */
function buildInventoryQuery(
  filters: InventoryFilters = {},
  includePagination = true,
): string {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.location) {
    params.set("location", filters.location);
  }

  if (filters.category) {
    params.set("category", filters.category);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (includePagination) {
    if (filters.page !== undefined) {
      params.set("page", String(filters.page));
    }

    if (filters.pageSize !== undefined) {
      params.set("pageSize", String(filters.pageSize));
    }
  }

  if (filters.selected?.length) {
    params.set("selected", filters.selected.join(","));
  }

  return params.toString();
}

/**
 * F04: Retrieve one filtered page of inventory records.
 */
export async function getInventoryPage(
  filters: InventoryFilters = {},
): Promise<InventoryPageResponse> {
  const query = buildInventoryQuery(filters, true);

  const data = await request(
    `/inventory${query ? `?${query}` : ""}`,
  );

  if (
    !isObject(data) ||
    !Array.isArray(data.items) ||
    typeof data.page !== "number" ||
    !Number.isSafeInteger(data.page) ||
    typeof data.pageSize !== "number" ||
    !Number.isSafeInteger(data.pageSize) ||
    typeof data.total !== "number" ||
    !Number.isSafeInteger(data.total) ||
    data.page < 1 ||
    data.pageSize < 1 ||
    data.total < 0
  ) {
    throw new Error(
      "The server returned an unexpected inventory page response.",
    );
  }

  const validItems = data.items.every(
    (item) =>
      isObject(item) &&
      typeof item.id === "string" &&
      (item.inventory_id === null ||
        typeof item.inventory_id === "string") &&
      typeof item.product_id === "string" &&
      typeof item.location_id === "string" &&
      typeof item.name === "string" &&
      typeof item.sku === "string" &&
      (item.category_id === null ||
        typeof item.category_id === "string") &&
      typeof item.category_name === "string" &&
      typeof item.location_name === "string" &&
      typeof item.location_code === "string" &&
      (typeof item.quantity === "string" ||
        typeof item.quantity === "number") &&
      Number.isFinite(Number(item.quantity)) &&
      (typeof item.reorder_level === "string" ||
        typeof item.reorder_level === "number") &&
      Number.isFinite(Number(item.reorder_level)) &&
      (
        item.stock_status === "IN_STOCK" ||
        item.stock_status === "LOW_STOCK" ||
        item.stock_status === "OUT_OF_STOCK"
      ) &&
      typeof item.status === "string" &&
      (item.updated_at === null ||
        typeof item.updated_at === "string") &&
      (item.last_movement_at === null ||
        typeof item.last_movement_at === "string"),
  );

  if (!validItems) {
    throw new Error(
      "The server returned an invalid inventory record.",
    );
  }

  return {
    items: data.items as InventoryPageRecord[],
    page: data.page,
    pageSize: data.pageSize,
    total: data.total,
  };
}

/**
 * F04: Retrieve inventory summary counts.
 * The summary follows search, location and category filters.
 * It intentionally does not apply the stock status filter.
 */
export async function getInventorySummary(
  filters: InventoryFilters = {},
): Promise<InventorySummary> {
  const summaryFilters: InventoryFilters = {
    search: filters.search,
    location: filters.location,
    category: filters.category,
  };

  const query = buildInventoryQuery(summaryFilters, false);

  const data = await request(
    `/inventory/summary${query ? `?${query}` : ""}`,
  );

  if (
    !isObject(data) ||
    typeof data.total !== "number" ||
    !Number.isSafeInteger(data.total) ||
    typeof data.in_stock !== "number" ||
    !Number.isSafeInteger(data.in_stock) ||
    typeof data.low_stock !== "number" ||
    !Number.isSafeInteger(data.low_stock) ||
    typeof data.out_of_stock !== "number" ||
    !Number.isSafeInteger(data.out_of_stock)
  ) {
    throw new Error(
      "The server returned an unexpected inventory summary response.",
    );
  }

  return {
    total: data.total,
    in_stock: data.in_stock,
    low_stock: data.low_stock,
    out_of_stock: data.out_of_stock,
  };
}

/**
 * F04: Export filtered inventory records as a CSV file.
 *
 * This uses fetch directly because the endpoint returns CSV,
 * rather than the JSON response handled by request().
 */
export async function exportInventoryCsv(
  filters: InventoryFilters = {},
): Promise<void> {
  const query = buildInventoryQuery(filters, false);

  const response = await fetch(
    `${API_BASE_URL}/inventory/export.csv${query ? `?${query}` : ""}`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "text/csv",
      },
    },
  );

  if (!response.ok) {
    const data: unknown = await response.json().catch(() => ({}));

    const message =
      isObject(data) && typeof data.error === "string"
        ? data.error
        : `CSV export failed. HTTP ${response.status}`;

    throw new Error(message);
  }

  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = "stock-on-hand.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 1000);
}

export async function getProducts(): Promise<ProductOption[]> {
  const data = await request("/products?status=active&page=1&pageSize=100");

  if (
    !isObject(data) ||
    !Array.isArray(data.items) ||
    !data.items.every(
      (item) =>
        isObject(item) &&
        typeof item.product_id === "string" &&
        typeof item.name === "string" &&
        typeof item.sku === "string",
    )
  ) {
    throw new Error("The server returned an unexpected products response.");
  }

  return data.items as ProductOption[];
}

// F03: Retrieve one product and its stock across all active locations.
export async function getProductDetails(
  productId: string,
): Promise<ProductDetailResponse> {
  if (!productId.trim()) {
    throw new Error("A product ID is required.");
  }

  const data = await request(
    `/products/${encodeURIComponent(productId)}`,
  );

  if (
    !isObject(data) ||
    !isObject(data.product) ||
    !isObject(data.summary) ||
    !Array.isArray(data.locations) ||
    !Array.isArray(data.recent_movements)
  ) {
    throw new Error(
      "The server returned an unexpected product details response.",
    );
  }

  const product = data.product;
  const summary = data.summary;

  if (
    typeof product.product_id !== "string" ||
    typeof product.category_id !== "string" ||
    typeof product.name !== "string" ||
    typeof product.sku !== "string" ||
    typeof product.unit_of_measure !== "string" ||
    typeof product.reorder_level !== "string" ||
    typeof product.status !== "string" ||
    typeof summary.total_on_hand !== "string"
  ) {
    throw new Error(
      "The server returned incomplete product details.",
    );
  }

  const validLocations = data.locations.every(
    (location) =>
      isObject(location) &&
      typeof location.location_id === "string" &&
      typeof location.location_name === "string" &&
      typeof location.location_code === "string" &&
      typeof location.quantity === "string",
  );

  if (!validLocations) {
    throw new Error(
      "The server returned invalid product location data.",
    );
  }

  const validMovements = data.recent_movements.every(
    (movement) =>
      isObject(movement) &&
      typeof movement.movement_id === "string" &&
      typeof movement.movement_type === "string" &&
      typeof movement.quantity_change === "string" &&
      typeof movement.quantity_before === "string" &&
      typeof movement.quantity_after === "string" &&
      typeof movement.created_at === "string",
  );

  if (!validMovements) {
    throw new Error(
      "The server returned invalid product movement history.",
    );
  }

  return data as unknown as ProductDetailResponse;
}

export async function getLocations(): Promise<LocationOption[]> {
  const data = await request("/locations");

  if (
    !isObject(data) ||
    !Array.isArray(data.items) ||
    !data.items.every(
      (item) =>
        isObject(item) &&
        typeof item.location_id === "string" &&
        typeof item.name === "string" &&
        typeof item.code === "string" &&
        typeof item.status === "string",
    )
  ) {
    throw new Error("The server returned an unexpected locations response.");
  }

  return (data.items as LocationOption[]).filter(
    (location) => location.status === "active",
  );
}

/**
 * Fetch all pages rather than treating the paginated inventory endpoint as an array.
 * Kept for existing pages that need the complete inventory list.
 */
export async function getInventory(): Promise<InventoryRecord[]> {
  const pageSize = 100;
  const maxPages = 1000;
  const output: InventoryRecord[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await request(
      `/inventory?page=${page}&pageSize=${pageSize}`,
    );

    if (
      !isObject(data) ||
      !Array.isArray(data.items) ||
      typeof data.total !== "number" ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0
    ) {
      throw new Error("The server returned an unexpected inventory response.");
    }

    for (const item of data.items) {
      if (
        !isObject(item) ||
        (item.inventory_id !== null && typeof item.inventory_id !== "string") ||
        typeof item.product_id !== "string" ||
        typeof item.location_id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.sku !== "string" ||
        typeof item.location_name !== "string" ||
        (typeof item.quantity !== "string" &&
          typeof item.quantity !== "number") ||
        item.quantity === "" ||
        !Number.isFinite(Number(item.quantity))
      ) {
        throw new Error("The server returned an invalid inventory record.");
      }

      output.push({
        inventory_id: item.inventory_id,
        product_id: item.product_id,
        location_id: item.location_id,
        quantity: Number(item.quantity),
        product_name: item.name,
        product_sku: item.sku,
        location_name: item.location_name,
      });
    }

    if (output.length >= data.total) {
      return output;
    }

    if (data.items.length === 0) {
      throw new Error(
        "Inventory pagination ended before all records were received.",
      );
    }
  }

  throw new Error(
    "Inventory exceeds the supported page limit; refine the lookup API.",
  );
}

export async function getReasonCodes(
  movementType: StockMovementType,
): Promise<ReasonCode[]> {
  const data = await request(
    `/reason-codes?movement_type=${encodeURIComponent(movementType)}`,
  );

  if (
    !isObject(data) ||
    !Array.isArray(data.reason_codes) ||
    !data.reason_codes.every(
      (item) =>
        isObject(item) &&
        typeof item.reason_code_id === "string" &&
        item.movement_type === movementType &&
        typeof item.code === "string" &&
        typeof item.label === "string" &&
        typeof item.requires_note === "boolean",
    )
  ) {
    throw new Error("The server returned an unexpected reason codes response.");
  }

  return data.reason_codes as ReasonCode[];
}

export async function createStockMovement(
  movement: CreateStockMovementInput,
): Promise<StockMovementResult> {
  const data = await request("/stock-movements", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(movement),
  });

  if (!isObject(data) || !isObject(data.movement)) {
    throw new Error(
      "The server returned an unexpected stock movement response. Verify the operation before retrying.",
    );
  }

  return {
    movement: data.movement,
  };
}

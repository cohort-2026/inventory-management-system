
const API_BASE_URL = `${import.meta.env.VITE_API_URL ?? "http://localhost:5000"}/api`;

export interface InventoryRecord {
  inventory_id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  product_name: string;
  product_sku: string;
  location_name: string;
}

export interface ProductOption {
  product_id: string;
  name: string;
  sku: string;
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
  return typeof value === "object" && value !== null;
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
        typeof item.inventory_id !== "string" ||
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

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

export interface StockAdjustment {
  product_id: string;
  location_id: string;
  adjustment: number;
  reason: string;
  notes: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function request(path: string, options: RequestInit = {}): Promise<unknown> {
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
  const data = await request("/locations/");

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

export async function getInventory(): Promise<InventoryRecord[]> {
  const data = await request("/inventory");
  const records = Array.isArray(data)
    ? data
    : isObject(data)
      ? data.inventory
      : undefined;

  if (
    !Array.isArray(records) ||
    !records.every(
      (record) =>
        isObject(record) &&
        typeof record.inventory_id === "string" &&
        typeof record.product_id === "string" &&
        typeof record.location_id === "string" &&
        (typeof record.quantity === "number" ||
          (typeof record.quantity === "string" &&
            Number.isFinite(Number(record.quantity)))) &&
        typeof record.product_name === "string" &&
        typeof record.product_sku === "string" &&
        typeof record.location_name === "string",
    )
  ) {
    throw new Error("The server returned an unexpected inventory response.");
  }

  return records.map((record) => ({
    ...(record as Omit<InventoryRecord, "quantity">),
    quantity: Number(record.quantity),
  }));
}

export async function adjustInventory(
  adjustment: StockAdjustment,
): Promise<InventoryRecord> {
  const data = await request("/inventory/adjust", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(adjustment),
  });

  if (!isObject(data) || !isObject(data.inventory)) {
    throw new Error("The server returned an unexpected adjustment response.");
  }

  const record = data.inventory;
  if (
    typeof record.inventory_id !== "string" ||
    typeof record.product_id !== "string" ||
    typeof record.location_id !== "string" ||
    (typeof record.quantity !== "number" &&
      !(typeof record.quantity === "string" &&
        Number.isFinite(Number(record.quantity)))) ||
    typeof record.product_name !== "string" ||
    typeof record.product_sku !== "string" ||
    typeof record.location_name !== "string"
  ) {
    throw new Error("The server returned an unexpected adjustment response.");
  }

  return {
    ...(record as Omit<InventoryRecord, "quantity">),
    quantity: Number(record.quantity),
  };
}

import { Request, Response } from "express";
import { supabase } from "../config/supabaseClient";

export async function getInventory(req: Request, res: Response) {
  try {
    const { search = "", page = "1", pageSize = "10" } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const size = parseInt(pageSize as string) || 10;
    const offset = (pageNum - 1) * size;

    // Get products
    let query = supabase
      .from("products")
      .select("*", { count: "exact" });

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    query = query.range(offset, offset + size - 1).order("created_at", { ascending: true });
    const { data: products, error, count } = await query;
    if (error) throw error;

    // Get inventory quantities for those products
    const productIds = (products || []).map((p: any) => p.product_id);
    const { data: inventoryData } = await supabase
      .from("inventory")
      .select("product_id, quantity")
      .in("product_id", productIds);

    const qtyMap = new Map(inventoryData?.map((i: any) => [i.product_id, i.quantity]) || []);

    const items = (products || []).map((p: any) => {
      const quantity = qtyMap.get(p.product_id) ?? 0;
      let status = "In Stock";
      if (quantity === 0) status = "Out of Stock";
      else if (quantity <= 5) status = "Low Stock";

      return {
        id: p.product_id, // frontend expects id
        product_id: p.product_id,
        name: p.name,
        sku: p.sku,
        category_id: p.category_id,
        quantity,
        status,
      };
    });

    res.json({ items, page: pageNum, pageSize: size, total: count });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
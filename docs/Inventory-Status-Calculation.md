### Inventory Status Calculation

The Inventory Management System calculates stock status by comparing the available product quantity at a specific location with the product's reorder level.

The system follows three rules:

1. **Out of Stock:** The available quantity is zero.
2. **Low Stock:** The available quantity is greater than zero but below the product's reorder level.
3. **In Stock:** The available quantity is greater than zero and meets or exceeds the product's reorder level.

The calculation is performed separately for each product at each location.

Stock status is calculated using the latest inventory quantity and reorder level, rather than being stored as a separate value in the database. This ensures the status reflects changes whenever the inventory is retrieved again.

Missing, negative or invalid quantities and reorder levels are rejected to prevent inaccurate stock reporting.
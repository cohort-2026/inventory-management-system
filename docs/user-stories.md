# User Stories

**FUNCTION THAT WILL ALLOW CUSTOMER TO VIEW PRODUCTS ()**
**As a** customer, **I want to** view available products **so that** I can see which products are currently available.
Acceptance Criteria:
•	**Given that** the customer opens the website, 
•	**When** the product page loads, 
•	**Then** the system should display the available products and their current information. 
Error case:
•	Given that the customer attempts to access a page that does not exist, 
•	When the system cannot find the requested page, 
•	Then the system should display a 404 error page.

**FUNCTION THAT WILL UPDATE PRODUCTS TO SHOP**
**As a** staff member, **I want to** update product information **so that** the inventory remains accurate and up to date.
Acceptance Criteria
•	**Given that** the staff member is logged in, 
•	**When** they enter valid product information and save the changes, 
•	**Then** the system should update the product successfully. 
Invalid information
•	**Given that** the staff member is updating a product, 
•	**When** they enter invalid or incomplete information, 
•	**Then** the system should display an error message and prevent the invalid information from being saved.

**FUNCTION THAT WILL DELETE PRODUCTS TO SHOP**
**As a** staff member, **I want to** delete outdated products **so that** the inventory remains accurate.
Acceptance Criteria
•	**Given that** the staff member is authorized, 
•	**When** they select a product and choose to delete it, 
•	**Then** the system should ask for confirmation before deleting the product. 
•	**When** the staff member confirms the deletion, 
•	**Then** the system should remove the product from the active product list.

**FUNCTION THAT WILL SEARCH FOR PRODUCTS**
**As a** staff member, **I want to** search for products by name **so that** I can quickly check their availability.
Acceptance Criteria
•	**Given that** the staff member is viewing the inventory, 
•	**When** they enter a product name into the search field, 
•	**Then** the system should display matching products. 
•	If no matching product exists, the system should display a message indicating that no products were found.

**FUNCTION THAT WILL KEEP TRACK OF PRODUCT STATE**
**As a** staff member, **I want to** track product stock levels **so that** I can take action before products run out of stock.
Acceptance Criteria
•	**Given that** a product exists in the inventory, 
•	**When** its stock quantity reaches a low level, 
•	**Then** the system should indicate that the product is low in stock. 
•	**When** its quantity reaches zero, 
•	**Then** the system should indicate that the product is out of stock.

**FUNCTION THAT WILL VIEW STOCK HISTORY**
**As a** staff member, **I want to** view stock history **so that** I can understand how inventory has changed over time.
Acceptance Criteria
•	**Given that** the staff member has permission to view stock history, 
•	**When** they open the stock history, 
•	**Then** the system should display previous inventory changes.
# User flow

**USER FLOW** 1 — Customer Views Products
START
  ↓
Customer visits the website
  ↓
System displays the product page
  ↓
Customer searches for a product
  ↓
System checks the search
  ↓
Are matching products found?
       ↓
   ┌───┴───┐
  YES      NO
   ↓        ↓
Display    Display
matching   "No products
products   found"
   ↓
Customer selects a product
   ↓
System displays:
- Product name
- Description
- Price
- Availability
   ↓
Customer views product information
   ↓
END
________________________________________
**USER FLOW** 2 — Staff Login
START
  ↓
Staff opens staff dashboard
  ↓
System displays login page
  ↓
Staff enters email and password
  ↓
System validates credentials
  ↓
Are credentials valid?
       ↓
   ┌───┴───┐
  YES      NO
   ↓        ↓
Open       Display
staff      "Invalid
dashboard  credentials"
   ↓             ↓
END         Staff tries again
________________________________________
**USER FLOW** 3 — Staff Adds a Product
This is one of your most important flows.
START
  ↓
Staff logs into staff dashboard
  ↓
System validates login
  ↓
Login successful?
   ↓
 ┌─┴─────────┐
NO          YES
↓            ↓
Display      Display
login error  dashboard
             ↓
       Staff selects
       "Add Product"
             ↓
       System displays
       product form
             ↓
       Staff enters:
       - Product name
       - Description
       - Price
       - Quantity
             ↓
       Staff selects "Save"
             ↓
       System validates information
             ↓
       Is the information valid?
          ↓
      ┌───┴────┐
     NO       YES
      ↓         ↓
Display error   System checks
message         for duplicate product
      ↓              ↓
Staff corrects   Does product
information      already exist?
                     ↓
                 ┌───┴────┐
                YES       NO
                 ↓         ↓
             Display       Save
             warning       product
                           ↓
                     Update inventory
                           ↓
                     Display confirmation
                           ↓
                          END
________________________________________
**USER FLOW** 4 — Staff Updates Stock
This one is particularly important because inventory management is the main purpose of the system.
START
  ↓
Staff logs in
  ↓
System validates credentials
  ↓
Staff opens inventory
  ↓
Staff searches for product
  ↓
System displays product
  ↓
Staff selects product
  ↓
Staff changes stock quantity
  ↓
System validates new quantity
  ↓
Is the quantity valid?
      ↓
   ┌──┴──┐
  NO    YES
  ↓       ↓
Error    System checks
message  whether another
         staff member changed it
             ↓
        Was the product changed?
             ↓
         ┌───┴────┐
        YES       NO
         ↓         ↓
      Display     Save
      conflict    changes
      warning       ↓
                    Update
                    inventory
                      ↓
               Update customer view
                      ↓
               Display confirmation
                      ↓
                     END
________________________________________
**USER FLOW** 5 — Staff Deletes Product
START
  ↓
Staff logs in
  ↓
Staff opens inventory
  ↓
Staff searches for product
  ↓
System displays product
  ↓
Staff selects "Delete"
  ↓
System asks for confirmation
  ↓
Staff confirms?
     ↓
  ┌──┴───┐
 NO     YES
 ↓       ↓
Cancel   System checks product
         ↓
      Can product be deleted?
         ↓
      ┌──┴────┐
     NO      YES
     ↓         ↓
 Display      Delete product
 warning          ↓
              Update inventory
                  ↓
             Display confirmation
                  ↓
                 END
# System Requirements

## Functional Requirements

_Customer_
•	The system shall allow customers to view available products. 
•	The system shall allow customers to search for products. 
•	The system shall display the product name, description, price and availability. 
•	The system shall display updated product information. 
_Staff_
•	The system shall allow authorized staff members to log in using their credentials. 
•	The system shall allow authorized staff members to add new products. 
•	The system shall allow authorized staff members to update product information. 
•	The system shall allow authorized staff members to update stock quantities. 
•	The system shall allow authorized staff members to delete outdated products. 
•	The system shall allow authorized staff members to search for products. 
•	The system shall allow authorized staff members to view stock history.

•	Who performs the action?
    o Viewing - customers, staff
    o Adding/Updating - staff
•	What triggers the action?
    o Viewing - accessing the platform allows to view
    o Adding/Updating - login (app.staff, login with credentials)
•	What information is required?
    o Viewing - nothing (just go to website)
    o Adding/Updating - for logging in email & password. to help add stock/product into the system/database
•	What should happen when the action is successful?
    o Viewing - the available and total products show up on the website/platform.
    o Adding/Updating - the products are updated successfully based on what the staff input, and they also update on the customer’s access side.
•	What should happen when something goes wrong?
    o System should display an error and the error type

## Non-functional Requirements

Things to consider:
•	_Security_
    o Unauthorized customers should not be able to access the admin side
•	_Performance_
    o Product list should load in under 15 seconds.
    o No glitches in the code to make it load slowly.
    o Prevention of DoS
•	_Usability_
    o The system should be easy for customers to understand and use
•	_Responsiveness_
    o Should be able to work on different screen sizes and devices, eg. phone, tablet, pc
•	_Reliability_
    o there a should be a reliable database.
•	_Data validation_
    o The system should be able to validate login information before logging the staff user in
    o The system should not allow empty data product name, prize, etc…
•	_Error handling_
    o If an empty input is invalid, the system should tell you that the input is required.
    o If a non-existing page is accessed, it should show the corresponding error (404 error).
•	_Accessibility_
    o Customer accessibility should be by any user.
    o Staff dashboard should be by people who have staff access only

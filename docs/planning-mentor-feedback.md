# Inventory Management System — Presentation & Planning Feedback

**Team:** Inventory Management System  
**Document:** Planning, Requirements & User Flows  
**Review:** Planning Phase Presentation

## What you did well

The team demonstrated a **good understanding of the brief** and put together a well-structured planning document.

You covered the key areas we expected to see, including the business problem, stakeholders, functional and non-functional requirements, assumptions, user stories, acceptance criteria, user flows, system structure and success criteria.

We also liked the way the team worked together during the presentation. You were able to explain your proposed system and respond to questions as a team. The presentation showed that you had discussed the requirements amongst yourselves and had a shared understanding of the solution.

There was also a clear effort to identify the problems caused by the current manual process. You correctly identified issues such as inaccurate information, human error, outdated stock information, repetitive work and lost staff time.

Your proposed system also has a good foundation: centralising inventory information, providing staff with a dashboard, controlling access and keeping stock history are all reasonable starting points.

So this is **not a case of you misunderstanding the project**.

The next step is to take your thinking further.

---

# 1. Think beyond the client's brief

This is one of the most important lessons we want you to take from this exercise.

You did a good job of understanding and documenting what the client asked for. However, during the discussion, we felt that the solution stayed quite close to the brief and the **current manual process**.

In a real software project, a client may tell you:

> "We have this problem, and this is how we currently deal with it."

The client doesn't necessarily know what the best solution is.

They may know:

> "Our stock information is inaccurate."

> "We're using spreadsheets."

> "Our staff spend too much time checking stock."

But that doesn't mean the best solution is simply to create a website where staff continue doing the same work manually.

As developers and problem solvers, your responsibility is to understand:

**What is the actual problem? Why is it happening? What can technology do to improve it?**

You should be comfortable saying:

> **"We understand the brief, but we think there is a better way to solve this problem."**

This doesn't mean ignoring the client.

It means **using your knowledge to add value to what the client asked for.**

---

# 2. Ask yourself: are we actually reducing manual work?

Your presentation identifies the current problem as manual stock management and says the proposed system will replace spreadsheets and manual records with a centralised system.

However, much of the proposed solution still relies on staff manually updating the inventory.

For example, your stock update flow is:

> Login → Open inventory → Search product → Select product → Change quantity → Validate → Save & update

This is better than using a spreadsheet, but we want you to ask:

> **"Are we actually removing the manual work, or have we simply moved the manual work from a spreadsheet into a web application?"**

That is the important distinction.

---

# 3. The "25 bananas vs 15 bananas" scenario

This was one of the most important questions raised during the Q&A.

Imagine the system says:

> **25 bananas in stock**

But when a staff member goes to the shelf, they find:

> **15 bananas**

What does the system do?

The initial response was essentially that staff would count the physical stock and update the system.

But that raises another question:

> **Why did the stock become 15?**

Was it because:

- 5 were sold?
- 5 were damaged?
- 5 were stolen?
- 5 were used internally?
- 5 were transferred?
- Someone entered the wrong quantity?
- There was a previous counting error?

The system should help the business understand **what happened to the stock**, not simply allow someone to change `25` to `15`.

This is where you need to start thinking about **stock movements and transactions**, rather than just stock quantities.

---

# 4. Think about the complete stock lifecycle

At the moment, your thinking starts largely with:

> Product exists → staff update quantity.

Think about the full lifecycle instead.

For example:

**Stock received → inventory increases → products are sold → inventory decreases → stock reaches a threshold → system identifies low stock → business takes action → new stock is received → inventory increases again.**

Now ask yourselves:

- How does stock enter the system?
- How does stock leave the system?
- What event causes the quantity to change?
- Who made the change?
- When did it happen?
- Why did it change?
- Can the system identify unusual changes?
- Can the system alert staff before stock runs out?
- Can the system help the business decide when to reorder?

You don't necessarily have to implement every one of these in the MVP.

The point is to **think about the actual business process before deciding what the software should do.**

---

# 5. Your "stock history" needs deeper thinking

You included stock history as a requirement and user story, which is a good start.

But ask yourselves what "history" actually means.

A useful history shouldn't simply say:

> Stock changed from 20 → 15.

It should help answer:

> **Who changed it? When? What happened? Why?**

For example:

| Date | Product | Change | Reason | User |
|---|---|---:|---|---|
| 26 Aug | Bananas | -5 | Sold | Staff A |
| 26 Aug | Bananas | -2 | Damaged | Staff B |
| 27 Aug | Bananas | +50 | Stock received | Staff A |

That gives the business meaningful information about its inventory.

Again, this is an example of **thinking beyond CRUD operations**.

---

# 6. Reconsider your assumption about purchasing

Your presentation states:

> "The system manages stock viewing and updating; it is not a product purchasing platform."

We are **not telling you that you must build a purchasing system**.

Instead, we want you to question the boundary.

If the business sells physical products:

> **How does new stock get into the system?**

If someone receives 100 products from a supplier, how does that affect your system?

Does a staff member manually change the quantity?

Or could there eventually be a process such as:

**Purchase order → Stock received → Inventory automatically updated**

This is the kind of opportunity you should identify and investigate.

You can still decide that purchasing is **out of scope for the MVP**, but your decision should come from understanding the business process rather than simply excluding it.

---

# 7. Think about automation

Your success criteria include:

- Reducing errors
- Saving staff time
- Improving accuracy
- Improving visibility
- Maintaining history
- Centralising data

These are good goals.

Now ask:

> **What will the system actually automate to achieve these goals?**

For example, consider whether the system could eventually:

- Automatically adjust stock after a sale
- Automatically identify low-stock products
- Notify staff when stock reaches a threshold
- Record every stock movement
- Calculate stock changes
- Flag unusual discrepancies
- Generate inventory reports
- Suggest products that need attention
- Provide a dashboard showing important inventory information

You don't need to implement everything.

But you should start thinking:

> **"What work should the computer do so the staff don't have to?"**

---

# 8. Think about the customer experience too

Your customer functionality currently focuses on:

- Viewing products
- Searching
- Viewing product information
- Seeing availability

The Q&A highlighted an important problem.

What happens if the system says:

> **"20 bananas available"**

and the customer arrives at the store only to discover that there are actually 15?

That's not just an inventory problem anymore.

It becomes a **customer trust problem**.

Think about whether the system should:

- Show when stock was last updated
- Distinguish between exact and approximate availability
- Show "low stock"
- Allow customers to report incorrect availability
- Provide another way of checking availability
- Connect to another system that records sales

Again, don't automatically add every suggestion.

**Think through the problem and decide what makes sense.**

---

# 9. Don't confuse the current system with the future system

Your presentation has a good MVP structure, but be careful that "out of scope" doesn't become:

> "We don't need to think about this."

If something isn't part of the MVP, you should still ask:

> **"Will the way we build the MVP make it possible to add this later?"**

For example, if payments, purchasing, barcode scanning, point-of-sale integration or advanced reporting are future possibilities, your architecture should not unnecessarily prevent them.

The goal is:

**Build small, but think big.**

---

# 10. Continue thinking about real-world scenarios

Your acceptance criteria already include useful cases such as low stock, out-of-stock products, duplicate products, invalid input and conflicting updates.

Now take that thinking further.

Ask:

> **"What happens in the real world?"**

For example:

- A product is damaged.
- A product expires.
- Stock is stolen.
- Stock is transferred between stores.
- A supplier delivers fewer items than expected.
- Someone enters the wrong quantity.
- Two staff members update the same product.
- A product is returned by a customer.
- A product is sold but the inventory isn't updated.
- Physical stock doesn't match system stock.

These scenarios will help you design a system that reflects **how businesses actually operate**, rather than just how the database works.

---

# 11. Take initiative and challenge yourselves

We were impressed by the amount of work that went into the planning document.

You clearly took the exercise seriously and produced a structured plan covering the different stages of the planning process.

Now we want you to take that same initiative into the **problem-solving itself**.

Don't wait for a mentor to tell you:

> "Add stock alerts."

Instead, ask yourselves:

> "The client says they struggle with stock. What else could we do that would genuinely make their lives easier?"

If you identify something valuable, **bring it to us**.

You may be wrong. That's okay.

The purpose of the exercise is to learn how to reason about these decisions.

---

# What we want you to take away

The biggest lesson from this presentation is:

> **Don't just digitise the client's existing manual process. Understand the problem deeply enough to improve the process.**

You have already demonstrated that you can take a brief and turn it into a structured system plan.

Now we want you to develop the next skill:

> **Take the client's problem → question the current process → identify opportunities → propose a better solution → justify your decisions.**

Remember:

> **A client may know the problem they have without knowing exactly what solution they need.**

Part of your job is to help them discover that solution.

---

# Next steps

- [ ] Review the current stock update process and identify which steps can be automated.
- [ ] Define how stock enters and leaves the system.
- [ ] Revisit the meaning of **stock history** and determine what information should be recorded for each stock movement.
- [ ] Define how the system should handle discrepancies between physical stock and recorded stock.
- [ ] Explore how sales, damaged stock, returns, transfers and other stock movements could affect inventory.
- [ ] Consider how low-stock alerts or other automated notifications could help staff.
- [ ] Revisit the purchasing/stock-receiving process and decide what belongs in the MVP and what should be future functionality.
- [ ] Consider how incorrect inventory information affects customers.
- [ ] Review the MVP and make sure that "out of scope" features have been consciously considered rather than simply excluded.
- [ ] Identify at least a few improvements that **you**, as a team, believe would make the system more valuable to the client.
- [ ] Make sure the entire team understands and agrees with the revised direction before development begins.

## Final note

**Well done on the planning and presentation.**

You demonstrated preparation, teamwork and a solid understanding of the requirements. The structure of your planning shows that you are learning how to translate a business problem into system requirements.

The next step is to push yourselves beyond simply **documenting what the client asked for**.

We want to see you become confident enough to say:

> **"We understand the problem, but we think we can solve it better."**

That is where your role as software developers becomes much more valuable.

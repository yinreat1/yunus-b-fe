# Recent fixes

- POS: added local askıya alınmış satış (hold/resume/delete), persisted in localStorage under `propos-held-sales-v1`.
- Customer debt history: sale and payment queries now explicitly request rows 0-9999 and are sorted descending by created_at, avoiding the common 1000-row API cap.
- Historical/archived sales continue to be separated by settled_at.
- No data is deleted when a debt is settled; settled sales move to the archive view.

## Manual test
1. Add 2 products to cart, click `Askıya Al`.
2. Confirm cart clears and `Bekletilen (1)` appears.
3. Resume it; items and discounts should return.
4. Open a customer with older payments and verify the full payment list is shown, oldest entries included.

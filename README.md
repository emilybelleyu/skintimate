# Skintimate, Ingredient Decoder

A Chrome extension that lets you analyze the ingredients of skincare products and see which are good or bad for your skin type. Quickly highlights harmful and beneficial ingredients using the Cosmily API.

## Features

- Scrapes ingredients from product pages.
- Cleans and formats ingredient lists automatically.
- Analyzes ingredients with the Cosmily API.
- Shows a detailed results view:
  - Highlights beneficial ingredients.
  - Lists "free from" ingredients the product does not contain.
  - Sorts ingredients by hazard level.
- Collapsible categories for easy viewing.
- Skin type indicators (Dry, Oily, Combination, Sensitive).
- Attribute details view for more information.

## Usage

1. Navigate to a skincare product page.
2. Click the Skintimate extension icon.
3. Click **Analyze**.
4. View the analysis results.

## Dependencies

- Chrome Extension APIs (scripting, storage)
- [Cosmily API](https://docs.cosmily.com/) for ingredient analysis

## Notes

- Ensure you highlight the ingredients first if the site doesn't provide a structured list.
- Works with both **highlighted text** and **page scraping**.

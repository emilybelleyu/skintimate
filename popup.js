document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Scraping ingredients...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      function: scrapeIngredientsFromPage
    },
    async (injectionResults) => {
      if (!injectionResults || !injectionResults[0].result) {
        statusEl.textContent = "No ingredients found.";
        return;
      }

      let ingredients = injectionResults[0].result;
      // preprocess ingredients using regex
      ingredients = modifyInput(ingredients);

      statusEl.textContent = "Analyzing...";

      try {
        const response = await fetch("https://api.cosmily.com/api/v1/analyze/ingredient_list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients })
        });

        const data = await response.json();

        if (data.errors) {
          console.error("API returned errors:", data.errors);
          const errorMessages = data.errors.map(err => err.message || JSON.stringify(err)).join("; ");
          statusEl.textContent = `Error analyzing ingredients: ${errorMessages}`;
          return;
        }

        showResults(data);
      } catch (err) {
        console.error(err);
        statusEl.textContent = "Error analyzing ingredients.";
      }
    }
  );
});

// Show results with collapsible categories
function showResults(data) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Results:";
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  if (!data.analysis || !data.analysis.positive) {
    resultsDiv.textContent = "No analysis available.";
    return;
  }

  const positive = data.analysis.positive;
  const ingredientsTable = data.analysis.ingredients_table || [];

  for (let categoryName in positive) {
    const categoryData = positive[categoryName];
    if (categoryData.count <= 0) continue;

    const category = document.createElement("div");
    category.className = "category";

    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `<span>${categoryName}: ${categoryData.count} ingredient(s)</span><span class="arrow">▶</span>`;

    const ingredientList = document.createElement("ul");
    ingredientList.className = "ingredient-list hidden";

    // Map ingredient names to full objects from ingredients_table
    categoryData.list.forEach(ing => {
      const ingData = ingredientsTable.find(obj => obj.title === ing.title);
      const li = document.createElement("li");
      li.innerHTML = `${ingData?.title || ing.title} ${
        ingData?.ewg ? `(EWG: ${ingData.ewg.decision})` : ""
      }`;
      ingredientList.appendChild(li);
    });

    header.addEventListener("click", () => {
      ingredientList.classList.toggle("hidden");
      const arrow = header.querySelector(".arrow");
      arrow.textContent = ingredientList.classList.contains("hidden") ? "▶" : "▼";
    });

    category.appendChild(header);
    category.appendChild(ingredientList);
    resultsDiv.appendChild(category);
  }
}


// Preprocess ingredients using regex
function modifyInput(ingredientList) {
  const noningredientRegex = /^[\s\S]*?\n/g;
  ingredientList = ingredientList.replaceAll(noningredientRegex, "");

  const parenthesesRegex = /\([^)]*\)/g;
  ingredientList = ingredientList.replaceAll(parenthesesRegex, "");

  const bulletRegex = /•/g;
  ingredientList = ingredientList.replaceAll(bulletRegex, ",");

  const percentRegex = /\d+%/g;
  ingredientList = ingredientList.replaceAll(percentRegex, "");

  const commaRegex = /,(\s*,)*|\s+,/g;
  ingredientList = ingredientList.replaceAll(commaRegex, ",");

  const semicolonRegex = /;/g;
  ingredientList = ingredientList.replaceAll(semicolonRegex, "");

  return ingredientList;
}

// Scraping function injected into the page
function scrapeIngredientsFromPage() {
  const possibleSelectors = [
    "div[data-comp='ProductDetailIngredients']",
    ".product-ingredients",
    "#ingredients",
    ".ProductDetail__ingredients"
  ];

  for (let selector of possibleSelectors) {
    const el = document.querySelector(selector);
    if (el) return el.innerText.trim();
  }

  const allDivs = Array.from(document.querySelectorAll("div, p, span"));
  for (let div of allDivs) {
    if (div.innerText && div.innerText.match(/ingredients/i)) {
      return div.innerText.trim();
    }
  }

  return null;
}

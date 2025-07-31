(function () {
  if (!window.RR) {
    window.RR = {};
  }
  if (!window.R3_COMMON) {
    window.R3_COMMON = {};
  }
  var API_KEY = "<%=api_key %>" || window.R3_COMMON?.apiKey;
  var apiClientKey = "<%=api_client_key %>";
  var API_CLIENT_KEY = (apiClientKey.includes("-") ? apiClientKey.split("-")[1] : apiClientKey).trim() || window.R3_COMMON?.apiClientKey;
  var PLACEMENT = "<%=placement_name %>" || window.R3_COMMON?.placements;
  var AFFINITY_CONFIG_NAME = "<%=affinity_configuration %>" || window.R3_COMMON?.affinity_configuration || "default";
  var CURRENCY_SYMBOL =
    window.R3_COMMON?.currency ||
    "<%=region_id %>"?.split("|")[1] ||
    "<%=currency %>" ||
    "&#163;";
  var CURRENCY_LOCATION = "<%=currency_location %>" || "prefix";
  var REGION_ID = window.R3_COMMON?.regionId || "<%=region_id %>"?.split("|")[0] || "<%=default_region %>";
  var CURRENCY_CONVERTER_FACTOR = 100;
  var BASEURL =
    window.R3_COMMON?.baseUrl || "https://integration.richrelevance.com/rrserver/";
  var PLACEMENT__SELECTOR =
    window.R3_COMMON?.placementSelector ||
    "<%=location_selector %>" || "body";
  var user = window.R3_COMMON?.userId;
  var apiResponse = "";

  var getRCS = function (name) {
    if (window.RR?.c) {
      return window.RR.c(name);
    } else {
      try {
        var now = new Date();
        now = now.getTime();
        var ls = JSON.parse(localStorage.getItem(name));
        if (ls && ls.expires > now) {
          return ls.value;
        }
      } catch (e) {}
    }
  };

  /* build recsForPlacements parameters */
  const recsForPlacementsParams = new URLSearchParams();
  recsForPlacementsParams.set("includeStrategyData", true);
  recsForPlacementsParams.set("categoryData", false);
  recsForPlacementsParams.set("excludeHtml", true);
  recsForPlacementsParams.set("excludeItemAttributes", false);
  recsForPlacementsParams.set("apiKey", API_KEY);
  recsForPlacementsParams.set("apiClientKey", API_CLIENT_KEY);
  recsForPlacementsParams.set("placements", PLACEMENT);
  recsForPlacementsParams.set("sessionId", R3_COMMON.sessionId || "");

  /* build recsForPlacements parameters */
  const affinityScoresByConfigParams = new URLSearchParams();
  affinityScoresByConfigParams.set("apiKey", API_KEY);
  affinityScoresByConfigParams.set("apiClientKey", API_CLIENT_KEY);
  affinityScoresByConfigParams.set("sessionId", R3_COMMON.sessionId || "");
  affinityScoresByConfigParams.set(
    "affinityConfigName",
    AFFINITY_CONFIG_NAME
  );

  let rcs = getRCS("rr_rcs");
  if (rcs) {
    recsForPlacementsParams.set("rcs", rcs);
    affinityScoresByConfigParams.set("rcs", rcs);
  }

  if (user) {
    recsForPlacementsParams.set("userId", user);
    affinityScoresByConfigParams.set("userId", user);
  }

  var formatResponse = function (response) {
    var bundleData = response?.recommendedProducts;
    if (bundleData && bundleData.length > 0) {
      var formattedProducts = bundleData.map((product) => {
        return {
          productId: product.id,
          imageURL: product.imageURL,
          name: product.name,
          priceCents: product.priceCents,
          clickURL: product.clickURL,
          productURL: product.productURL,
          attributes: Object.entries(product.attributes || {}).map(
            ([key, value]) => ({
              attributeName: key,
              attributeValue:
                Array.isArray(value) && value.length > 0 ? value[0] : value,
            })
          ),
        };
      });
      return formattedProducts;
    }
    return [];
  };

  async function loadApi(url, method) {
    try {
        const response = await fetch(url, { method });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
  }

  var fetchAffinityCategories = async function () {
    try {
        const data = await loadApi(`${BASEURL}api/rrPlatform/affinityScoresByConfig?${affinityScoresByConfigParams.toString()}`, "GET");
        const categories = data?.categoryScores?.combinedScores || [];
        if (categories.length === 0) {
          removeView();
          return;
        }
        const formattedResponse = getTopCombinedScores(categories);
        createTabView(formattedResponse);
        await fetchRecommendation(formattedResponse[0]);
        appendToSelector(PLACEMENT__SELECTOR);
    } catch (error) {
        console.error("Failed to fetch affinity categories:", error);
    }
  };

  var getTopCombinedScores = function (categoriesData = []) {
    return categoriesData
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(a => ({ ...a, isLoaded: false }));
  };

  var fetchRecommendation = async function (category) {
    try {
        if (REGION_ID) {
            recsForPlacementsParams.set("rid", REGION_ID);
        }
        if (category) {
            recsForPlacementsParams.set("chi", category?.affinity?.externalId);
        }

        const data = await loadApi(`${BASEURL}api/rrPlatform/recsForPlacements?udd=t&${recsForPlacementsParams.toString()}`, "GET");
        const placementData = data?.placements?.[0] || [];
        
        const formattedResponse = {
            label: placementData.strategyMessage,
            ...formatResponse(placementData),
        };

        createRecsView(formattedResponse, category?.affinity?.externalId);
        category.isLoaded = Boolean(placementData?.recommendedProducts?.length);
        if (!category.isLoaded) {
          removeView();
        }
    } catch (error) {
        console.error("Failed to fetch recommendations:", error);
        throw error;
    }
  }

  var createTabView = function (formattedResponse) {
    const tabListContainer = document.querySelector(".algonomy-tabbed-recs-tab-list-container");

    // Create tabs container
    const tabListDiv = tabListContainer.appendChild(
      customCreateElement("div", { class: "algonomy-tabbed-recs-tab-list" })
    );

    formattedResponse.forEach((tab, index) => {
      const { externalId, name } = tab.affinity;
      const tabAttributes = { class: index === 0 ? "algonomy-tabbed-recs-tab-item active" : "algonomy-tabbed-recs-tab-item"};
      const tabItemDiv = customCreateElement("div", tabAttributes);
      const button = customCreateElement('button', {
        'data-attribute': `${externalId}`,
        'type': 'button'
      }, name);
      tabItemDiv.appendChild(button);
      tabItemDiv.addEventListener("click", (event) =>
        showCategory(event, tab)
      );
      tabListDiv.appendChild(tabItemDiv);
    });
  };

  var customCreateElement = function (
    elementType,
    attributes = [],
    content = "",
    htmlString = ""
  ) {
    var customElement = document.createElement(elementType);
    for (var key in attributes) {
      customElement.setAttribute(key, attributes[key]);
    }
    if (htmlString) {
      customElement.innerHTML = htmlString;
    }
    if (content) {
      customElement.appendChild(document.createTextNode(content));
    }
    return customElement;
  };

  var createRecsView = function (formattedResponse, chi) {
    const tabContainer = document.querySelector(".algonomy-tabbed-recs-product-list-container");
    const tab = tabContainer.appendChild(
      customCreateElement("div", { class: "algonomy-tabbed-recs-carousel-container" })
    );
    tab.appendChild(
      customCreateElement("button", { class: `algonomy-scroll-btn algonomy-scroll-btn-left-${chi}` }, "", 
        "&lsaquo;")
    );
    const productContainer = tab.appendChild(
      customCreateElement("div", { class: "algonomy-tabbed-product-container", id: `${chi}` })
    );

    // Extract products from formattedResponse
    const products = Object.values(formattedResponse).filter(
      (item) => item?.productId && item?.imageURL
    );

    products.forEach((product) => {
      const productTh = customCreateElement(
        "div",
        {
          class: "algonomy-tabbed-product-card click-trigger",
        },
        "",
        `     
            <a href="${product.clickURL}" target="_blank">
                  <img src="${product.imageURL}" alt="${product.productId}" />
            </a>
            <h5 class="algonomy-tabbed-product-name">${product.name}</h5>
            <p class="algonomy-tabbed-product-price">
              ${
                CURRENCY_LOCATION === "Prefix"
                  ? `${CURRENCY_SYMBOL} ${(
                      product.priceCents / CURRENCY_CONVERTER_FACTOR
                    ).toFixed(2)}`
                  : `${(
                      product.priceCents / CURRENCY_CONVERTER_FACTOR
                    ).toFixed(2)} ${CURRENCY_SYMBOL}`
              }              
            </p>
          `
      );

      productContainer.appendChild(productTh);
    });

    tab.appendChild(
      customCreateElement("button", { class: `algonomy-scroll-btn algonomy-scroll-btn-right-${chi}` }, "", "&rsaquo;")
    );
    document.querySelector(`.algonomy-scroll-btn-left-${chi}`).addEventListener("click", () => {
      scrollCarouselLeft(`${chi}`);
    });
    document.querySelector(`.algonomy-scroll-btn-right-${chi}`).addEventListener("click", () => {
      scrollCarouselRight(`${chi}`);
    });
    const labelDiv = document.querySelector(".algonomy-tabbed-recs-title");
    if(labelDiv && formattedResponse.label) {
      labelDiv.innerText = formattedResponse.label;
    }
  };

  var appendToSelector = function (querySelector) {
    var tabbedRecsContainer = document.querySelector(".algonomy-tabbed-recs-container");
    tabbedRecsContainer.parentElement.removeChild(tabbedRecsContainer);
    const target = document.querySelector(querySelector);
    target.appendChild(tabbedRecsContainer);
    addListeners(tabbedRecsContainer);
  };

  var removeView = function () {
    var tabbedRecsContainer = document.querySelector(".algonomy-tabbed-recs-container");
    if(tabbedRecsContainer) {
      tabbedRecsContainer.parentElement.removeChild(tabbedRecsContainer);
    }
  };

  var showCategory = async function (event, category) {
    if (!category.isLoaded) {
        showLoading();
        await fetchRecommendation(category);
        category.isLoaded = true;
    }
    updateUI(event, category);
    hideLoading();
  };

  var updateUI = function (event, category) {
    document
        .querySelectorAll(".algonomy-tabbed-recs-carousel-container")
        .forEach((container) => (container.style.display = "none"));

    document
        .querySelectorAll(".algonomy-tabbed-recs-tab-item")
        .forEach((tab) => tab.classList.remove("active"));

    const categoryId = category.affinity.externalId;
    const container = document.getElementById(categoryId).parentElement;
    container.style.display = "flex";
    event.target.parentElement.classList.add("active");
    document.getElementById(categoryId).scrollLeft = 0;
  };

  var scrollCarouselLeft = function (category) {
    const container = document.getElementById(category);
    if (container) container.scrollBy({ left: -500, behavior: "smooth" });
  };

  var scrollCarouselRight = function (category) {
    const container = document.getElementById(category);
    if (container) container.scrollBy({ left: 500, behavior: "smooth" });
  };

  var showLoading = function() {
    document.querySelector('.algonomy-loading-overlay').style.display = 'flex';
  }
  
  var hideLoading = function() {
    document.querySelector('.algonomy-loading-overlay').style.display = 'none';
  }

  var addListeners = function(container) {
    window.RR?.experience?.addListeners(EXPERIENCE, container);
  }

  fetchAffinityCategories();
})();

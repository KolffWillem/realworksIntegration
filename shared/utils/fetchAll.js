const axios = require("axios");

const fetchAll = async (url) => {
  let currentUrl = url;
  let items = [];

  while (true) {
    const response = await axios.get(currentUrl);
    if (response.status !== 200) {
      return [];
    }

    const {
      resultaten,
      paginering: { volgende },
    } = response.data;

    items = [...items, ...resultaten];

    if (!volgende) {
      break;
    }

    // Extract the vanaf parameter from the URL
    const vanafMatch = volgende.match(/vanaf=(\d+)/);
    if (!vanafMatch) {
      break;
    }

    // Construct new URL with the extracted vanaf parameter
    const vanaf = vanafMatch[1];
    const urlObj = new URL(currentUrl);
    urlObj.searchParams.set('vanaf', vanaf);
    currentUrl = urlObj.toString();
  }

  return items;
};

module.exports = fetchAll;



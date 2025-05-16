const axios = require("axios");

const fetchAll = async (url) => {
  let api = url;
  let items = [];

  while (!!api) {
    const response = await axios.get(url);
    if (response.status !== 200) {
      return [];
    }

    const {
      resultaten,
      paginering: { volgende },
    } = response.data;

    const nextLink = volgende;
    api = nextLink ?? null;
    items = [...items, ...resultaten];
  }
  return items;
};

module.exports = fetchAll;

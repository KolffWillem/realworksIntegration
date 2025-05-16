//key, value must be unique
const convertToMap = (array, key, value) => {
  const map = {};

  array.forEach((x) => {
    map[x[key]] = x[value];
  });

  return map;
};

module.exports = convertToMap;

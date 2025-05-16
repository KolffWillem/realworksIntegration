const getBlockParties = (realworkBookings) => {
  const bookingMap = {};
  let maxParties = 0;
  for (const booking of realworkBookings) {
    const key = `${booking.begintijd}/${booking.eindtijd}`;
    if (!bookingMap[key]) {
      bookingMap[key] = 1;
    } else {
      bookingMap[key]++;
    }
    if (bookingMap[key] > maxParties) {
      maxParties = bookingMap[key];
    }
  }

  return maxParties;
};

module.exports = getBlockParties;

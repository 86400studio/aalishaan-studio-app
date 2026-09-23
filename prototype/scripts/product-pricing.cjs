const prices = require('../data/pricing.json');
const names = {white:'White', black:'Black', 'antique-gold':'Antique Gold'};
const frameImages = {white:'assets/site/frame%203.png', black:'assets/site/frame%202.png', 'antique-gold':'assets/site/frame%201.png'};
const money = frame => '₹' + prices[frame].toLocaleString('en-IN');
const cardPrice = frame => `<span>${names[frame]} frame</span>${money(frame)}`;
module.exports = {prices, names, frameImages, money, cardPrice};

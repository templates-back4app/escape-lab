// Server-side logic. There is no API that hands this file back to you: it travels
// to a new backend if, and only if, it is in a repository you control.
Parse.Cloud.define('discountedPrice', async (req) => {
  const q = new Parse.Query('Product');
  q.equalTo('sku', req.params.sku);
  const p = await q.first({ useMasterKey: true });
  if (!p) throw new Parse.Error(141, 'no such sku');
  return Math.round(p.get('price') * 0.9 * 100) / 100;
});

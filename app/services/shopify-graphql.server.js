// app/services/shopify-graphql.server.js
export async function shopifyGraphQL(admin, query, variables = {}) {
  const res = await admin.graphql(query, { variables });
  const json = await res.json();
  if (json?.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

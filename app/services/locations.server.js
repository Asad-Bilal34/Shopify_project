// app/services/locations.server.js
import { shopifyGraphQL } from "./shopify-graphql.server.js";

export async function listShopifyLocations(admin) {
  const out = [];
  let hasNext = true, after = null;

  while (hasNext) {
    const data = await shopifyGraphQL(
      admin,
      `
      query($after: String) {
        locations(first: 50, after: $after) {
          edges { cursor node { id name } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after }
    );

    const edges = data?.locations?.edges || [];
    edges.forEach(e => out.push({ id: e.node.id, name: e.node.name }));

    hasNext = data?.locations?.pageInfo?.hasNextPage || false;
    after = data?.locations?.pageInfo?.endCursor || null;
  }

  return out;
}

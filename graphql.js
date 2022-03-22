const { gql } = require('graphql-request');
module.exports = gql`
query ($cursor: Int, $take: Int = 15, $skip: Int = 0, $address: String, $search: String, $orderBy: NodesOrderBy) {
    nodes(
      cursor: $cursor
      take: $take
      skip: $skip
      address: $address
      search: $search
      orderBy: $orderBy
    ) {
      page
      totalPages
      cursor
      totalItems
      hasMoreItems
      items {
        id
        uid
        type
        address
        node_id
        node_type
        name
        description
        location
        logo
        staked_nft
        rpc_url
        ws_url
        web_url
        json_url
        dvpn_address
        created_at
        added_at
        city {
          name
          state
          country
          __typename
        }
        __typename
      }
      __typename
    }
  }
  
`

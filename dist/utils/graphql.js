export const createPostsQuery = (author, cursor) => ({
    operationName: "FetchPosts",
    variables: {
        username: author,
        tag: null,
        cursor: cursor ?? null,
        temp_only: false,
        limit: 20,
    },
    query: `
      query FetchPosts($cursor: ID, $username: String, $temp_only: Boolean, $tag: String, $limit: Int) {
        posts(cursor: $cursor, username: $username, temp_only: $temp_only, tag: $tag, limit: $limit) {
          id
          title
          short_description
          thumbnail
          user {
            id
            username
            profile {
              id
              thumbnail
              __typename
            }
            __typename
          }
          url_slug
          released_at
          updated_at
          comments_count
          tags
          is_private
          likes
          __typename
        }
      }
    `,
});
export const createPostDetailQuery = (author, slug) => ({
    operationName: "FetchPostDetail",
    variables: {
        username: author,
        url_slug: slug,
    },
    query: `
      query FetchPostDetail($username: String, $url_slug: String) {
        post(username: $username, url_slug: $url_slug) {
          id
          title
          released_at
          updated_at
          tags
          body
          short_description
          is_markdown
          is_private
          is_temp
          thumbnail
          comments_count
          url_slug
          likes
          liked
          user {
            id
            username
            profile {
              id
              display_name
              thumbnail
              short_bio
              profile_links
              __typename
            }
            velog_config {
              title
              __typename
            }
            __typename
          }
          comments {
            id
            user {
              id
              username
              profile {
                id
                thumbnail
                __typename
              }
              __typename
            }
            text
            replies_count
            level
            created_at
            deleted
            __typename
          }
          series {
            id
            name
            url_slug
            series_posts {
              id
              post {
                id
                title
                url_slug
                user {
                  id
                  username
                  __typename
                }
                __typename
              }
              __typename
            }
            __typename
          }
          linked_posts {
            previous {
              id
              title
              url_slug
              user {
                id
                username
                __typename
              }
              __typename
            }
            next {
              id
              title
              url_slug
              user {
                id
                username
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `,
});
//# sourceMappingURL=graphql.js.map
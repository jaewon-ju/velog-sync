export declare const createPostsQuery: (author: string, cursor?: string | null) => {
    operationName: string;
    variables: {
        username: string;
        tag: null;
        cursor: string | null;
        temp_only: boolean;
        limit: number;
    };
    query: string;
};
export declare const createPostDetailQuery: (author: string, slug: string) => {
    operationName: string;
    variables: {
        username: string;
        url_slug: string;
    };
    query: string;
};
//# sourceMappingURL=graphql.d.ts.map
/** pgvector literal for PostgREST: "[0.1,0.2,…]". */
export const toVector = (v: number[]) => `[${v.join(",")}]`;

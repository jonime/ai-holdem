declare module "*.mdx" {
  export const title: string;
  export const metadata: {
    readonly title: string;
    readonly description: string;
  };
}

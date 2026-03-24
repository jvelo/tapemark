declare module "*.css?raw" {
  const content: string;
  export default content;
}

declare module "*.js?raw" {
  const content: string;
  export default content;
}

declare namespace preact.JSX {
  interface IntrinsicElements {
    "tm-confirm-button": preact.JSX.HTMLAttributes<HTMLElement> & {
      "data-message"?: string;
    };
    "tm-display-options": preact.JSX.HTMLAttributes<HTMLElement> & {
      "data-column"?: string;
      "data-options"?: string;
    };
    "tm-image-cell": preact.JSX.HTMLAttributes<HTMLElement> & {
      "data-src"?: string;
      "data-height"?: string;
      "data-preview"?: string;
    };
    "tm-modal": preact.JSX.HTMLAttributes<HTMLElement> & {
      "data-title"?: string;
    };
    "tm-reference-input": preact.JSX.HTMLAttributes<HTMLElement> & {
      "data-table"?: string;
      "data-column"?: string;
      "data-value"?: string;
      "data-label-column"?: string;
    };
  }
}

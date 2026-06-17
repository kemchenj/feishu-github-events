export interface LarkText {
  tag: "plain_text" | "lark_md";
  content: string;
}

export type LarkCardElement =
  | LarkDivElement
  | LarkHrElement
  | LarkActionElement;

export interface LarkDivElement {
  tag: "div";
  text?: LarkText;
  fields?: LarkField[];
}

export interface LarkField {
  is_short: boolean;
  text: LarkText;
}

export interface LarkHrElement {
  tag: "hr";
}

export interface LarkActionElement {
  tag: "action";
  actions: LarkAction[];
}

export type LarkAction = LarkButtonAction;

export interface LarkButtonAction {
  tag: "button";
  text: LarkText;
  url: string;
  type?: "default" | "primary" | "danger";
}

export interface LarkMessage {
  msg_type: "interactive";
  card: {
    config: {
      wide_screen_mode: boolean;
    };
    header: {
      template: string;
      title: LarkText;
    };
    elements: LarkCardElement[];
  };
}

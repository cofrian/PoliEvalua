export type AuthActionState = {
  status: "idle" | "error" | "success" | "otp_sent";
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

export const initialAuthActionState: AuthActionState = {
  status: "idle",
  message: "",
};

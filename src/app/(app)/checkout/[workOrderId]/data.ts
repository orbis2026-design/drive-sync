import { cache } from "react";
import { getCheckoutData } from "./actions";

export const getCheckoutDataCached = cache(getCheckoutData);


import { cache } from "react";
import { getQuoteData } from "./actions";

export const getQuoteDataCached = cache(getQuoteData);


import { FEED_PAGE_FETCH_SIZE, type Confession, fromRow } from "@noface/shared";
import { cookies } from "next/headers";
import HomePageClient from "./home-page-client";
import { createClient } from "../utils/supabase/server";

export default async function HomePage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let initialFeed: Confession[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("confessions")
      .select("id, user_id, text, mood, is_private, created_at")
      .eq("is_private", false)
      .order("created_at", { ascending: false })
      .range(0, FEED_PAGE_FETCH_SIZE - 1);

    if (error) {
      console.error(error);
    } else {
      initialFeed = (data ?? []).map(fromRow);
    }
  }

  return <HomePageClient hasServerSupabase={Boolean(supabase)} initialFeed={initialFeed} />;
}
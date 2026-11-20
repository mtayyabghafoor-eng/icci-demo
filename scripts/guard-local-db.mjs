// Refuses unless .env.localdb describes the LOCAL Docker database, so
// "npm run db:reset" can never wipe a cloud database. Prints no values.
const env = process.env.ICCI_ENVIRONMENT;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (env !== "development" || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  console.error("Refusing: .env.localdb is not the local database. Run: npm run setup:local-db");
  process.exit(1);
}

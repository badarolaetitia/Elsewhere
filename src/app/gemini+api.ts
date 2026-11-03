export async function POST() {
  return Response.json({success:false,error:"This endpoint is no longer available. Use the place search."},{status:410});
}

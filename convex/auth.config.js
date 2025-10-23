export default {
  providers: [
    {
      domain: Process.env.CLERK_JWT_ISSUER_DOMAIN ,
      applicationID: "convex",
    },
  ]
};
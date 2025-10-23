import { Button } from "@/components/ui/button";
// import { SignInButton, SignedOut, SignUpButton, UserButton, SignedIn} from "@clerk/nextjs";

export default function Home() {
  return (
  <div>
    {/* <SignedOut>
      <SignInButton />
      <SignUpButton/>
    </SignedOut>
    <SignedIn>
      <UserButton />
    </SignedIn> */}
    
    <Button variant={'destructive'}>Yash</Button>
  </div>
  );
}

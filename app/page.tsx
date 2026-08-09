import { KeeperApp } from "./keeper-app";
import { AuthGate } from "./auth-gate";

export default function Home() {
  return <AuthGate><KeeperApp /></AuthGate>;
}

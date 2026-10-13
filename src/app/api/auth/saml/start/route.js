import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/localDb";
import { buildSamlAuthorizeUrl, getSamlBaseUrl, isSamlConfigured } from "@/lib/auth/saml.js";

export async function GET(request) {
  const settings = await getSettings();
  const origin = getSamlBaseUrl(request, settings);
  try {
    if (!isSamlConfigured(settings)) {
      return NextResponse.redirect(new URL("/login?error=saml_not_configured", origin));
    }
    if (!origin.startsWith("https://")) {
      return NextResponse.redirect(new URL("/login?error=saml_https_required", origin));
    }

    const { authorizeUrl, requestId } = await buildSamlAuthorizeUrl(request, settings);
    if (!requestId) throw new Error("SAML request ID was not generated");

    const cookieStore = await cookies();
    cookieStore.set("saml_state", requestId, {
      httpOnly: true,
      // The IdP returns a cross-site POST. None requires HTTPS.
      sameSite: "none",
      secure: true,
      path: "/",
      maxAge: 10 * 60,
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message || "saml_start_failed")}`, origin)
    );
  }
}

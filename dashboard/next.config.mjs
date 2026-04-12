/** @type {import('next').NextConfig} */
const nextConfig = {
  // Default clean wipes `.next` via highly parallel deletes; that can stall indefinitely on
  // cloud-synced or AV-heavy Windows trees (e.g. OneDrive). Delete `.next` manually when you need a cold build.
  cleanDistDir: false,
};

export default nextConfig;

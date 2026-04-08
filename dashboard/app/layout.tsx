export const metadata = {
  title: 'HIVE · SPY Options',
  description: 'Operator dashboard for the SPY options signal hive',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

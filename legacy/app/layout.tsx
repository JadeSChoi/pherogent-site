import type { Metadata } from "next";
export const metadata:Metadata={title:"Pherogent — Research Workspace",description:"A research workspace for questions, papers and author-reviewed evidence."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}

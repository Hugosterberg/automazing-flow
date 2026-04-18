import { m } from "framer-motion";
import { LineChart, Megaphone, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  { icon: LineChart, title: "Pipeline", desc: "Follow opportunities and conversion trends." },
  { icon: Megaphone, title: "Campaigns", desc: "Coordinate campaign ideas and execution." },
  { icon: Target, title: "Performance", desc: "Track goals and key sales metrics over time." },
];

export default function SalesMarketingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-2xl mx-auto">
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <h1 className="text-3xl font-bold tracking-tight flex items-center justify-center gap-2">
          <LineChart className="h-8 w-8 text-primary" />
          Sales & Marketing
        </h1>
        <p className="text-muted-foreground">
          A workspace for campaigns, funnel visibility, and sales planning.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          {features.map((f, i) => (
            <m.div
              key={f.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
            >
              <Card className="bg-card border-border glow-border hover:glow-sm transition-shadow duration-300">
                <CardContent className="p-5 text-center space-y-2">
                  <f.icon className="h-6 w-6 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            </m.div>
          ))}
        </div>
      </m.div>
    </div>
  );
}

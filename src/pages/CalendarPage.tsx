import { motion } from "framer-motion";
import { CalendarDays, Bell, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  { icon: CalendarDays, title: "Smart schemaläggning", desc: "Automatiska mötesbokningar" },
  { icon: Bell, title: "Påminnelser", desc: "Aldrig missa ett möte igen" },
  { icon: Clock, title: "Tidsoptimering", desc: "AI-baserad tidsplanering" },
];

export default function CalendarPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
          Coming soon
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground">
          Automatisera din kalender – möten, påminnelser och tidsplanering.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          {features.map((f, i) => (
            <motion.div
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
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

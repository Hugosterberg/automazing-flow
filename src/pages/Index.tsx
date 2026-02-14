import { motion } from "framer-motion";
import { Zap, Share2, ShoppingCart, CalendarDays, Mail, Settings, ArrowRight } from "lucide-react";
import { LightbulbGlowIcon } from "@/components/platform-icons";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ProfileList } from "@/components/ProfileList";

const areas = [
  {
    title: "Social Media",
    desc: "Schemalägg, analysera och automatisera dina sociala kanaler",
    icon: Share2,
    url: "/social-media",
    ready: true,
  },
  {
    title: "E-commerce",
    desc: "Ordrar, lager och försäljningsanalys på autopilot",
    icon: ShoppingCart,
    url: "/ecommerce",
    ready: false,
  },
  {
    title: "Calendar",
    desc: "Smart schemaläggning och automatiska påminnelser",
    icon: CalendarDays,
    url: "/calendar",
    ready: true,
  },
  {
    title: "Mail",
    desc: "Hantera och automatisera dina mejl",
    icon: Mail,
    url: "/mail",
    ready: false,
  },
  {
    title: "AI Recommendations",
    desc: "AI-drivna förslag och rekommendationer",
    icon: LightbulbGlowIcon,
    url: "/ai-recommendations",
    ready: false,
  },
  {
    title: "Preferences",
    desc: "Inställningar, tema och säkerhet",
    icon: Settings,
    url: "/preferences",
    ready: false,
  },
];

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-3xl space-y-6"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center glow-md">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          auto<span className="text-muted-foreground">mazing</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Automatisera dina vardagliga arbetsuppgifter. Ett verktyg i taget.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-10"
      >
        <ProfileList />
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-14 max-w-4xl w-full">
        {areas.map((area, i) => (
          <motion.div
            key={area.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
          >
            <Card
              onClick={() => navigate(area.url)}
              className="bg-card border-border glow-border hover:glow-md transition-all duration-300 cursor-pointer group"
            >
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <area.icon className="h-6 w-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                  {!area.ready && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      Snart
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{area.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{area.desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

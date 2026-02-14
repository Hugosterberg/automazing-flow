import { motion } from "framer-motion";
import { TrendingUp, Users, FileText, Sparkles, Clock, Heart, MessageCircle, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

const stats = [
  { label: "Followers", value: "12,847", change: "+3.2%", icon: Users },
  { label: "Engagement", value: "8.4%", change: "+1.1%", icon: Heart },
  { label: "Inlägg denna vecka", value: "14", change: "+5", icon: FileText },
  { label: "Visningar", value: "48.2K", change: "+12%", icon: Eye },
];

const scheduledPosts = [
  { title: "Produktlansering – Instagram", time: "Idag 14:00", platform: "Instagram" },
  { title: "Tips & tricks video", time: "Imorgon 09:00", platform: "TikTok" },
  { title: "Veckosammanfattning", time: "Fre 18:00", platform: "LinkedIn" },
];

const contentIdeas = [
  "Bakom kulisserna – visa er arbetsprocess",
  "Kundrecension i karusellformat",
  "5 tips inom er bransch (Reels)",
  "Före/efter transformation",
  "Frågestund med era följare",
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function SocialMedia() {
  const [postContent, setPostContent] = useState("");

  return (
    <div className="space-y-8 max-w-6xl">
      <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
        <h1 className="text-3xl font-bold tracking-tight">Social Media</h1>
        <p className="text-muted-foreground mt-1">Automatisera och hantera dina sociala medier</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.08 }}>
            <Card className="bg-card border-border glow-border hover:glow-sm transition-shadow duration-300">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-green-400 font-medium">{stat.change}</span>
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scheduler */}
        <motion.div className="lg:col-span-2" {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Schemalägg inlägg
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Skriv ditt inlägg här..."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                className="bg-secondary border-border min-h-[100px] resize-none"
              />
              <div className="flex gap-3">
                <Input type="date" className="bg-secondary border-border w-auto" />
                <Input type="time" className="bg-secondary border-border w-auto" />
                <Button className="glow-sm hover:glow-md transition-shadow duration-300">
                  Schemalägg
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Content Ideas */}
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="bg-card border-border glow-border h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5" />
                Content-idéer
              </CardTitle>
              <CardDescription>AI-genererade förslag</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {contentIdeas.map((idea, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <span className="text-muted-foreground/50 mt-0.5">→</span>
                    {idea}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Scheduled Posts */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.5 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="text-lg">Schemalagda inlägg</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scheduledPosts.map((post, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{post.time}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-accent text-muted-foreground">
                    {post.platform}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

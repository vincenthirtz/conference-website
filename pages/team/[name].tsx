/* eslint-disable @next/next/no-img-element */
import { GetStaticPaths, GetStaticProps } from 'next';
import teams from '../../config/teams.json';
import Head from 'next/head';
import Link from 'next/link';
import Heading from '../../components/Typography/heading';
import Paragraph from '../../components/Typography/paragraph';
import Button from '../../components/Buttons/button';

interface Team {
  name: string;
  title: string;
  img: string;
  link: string;
  city: string[];
  color?: string; // optionnel
}

// Génère un dégradé HSL stable à partir du nom (fallback si pas de color dans JSON)
function gradientFromName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  const hue2 = (hue + 35) % 360;
  const c1 = `hsl(${hue} 85% 55%)`;
  const c2 = `hsl(${hue2} 85% 45%)`;
  return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = teams.map((team) => ({
    params: { name: team.name.replace(/\s+/g, '-').toLowerCase() },
  }));
  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const team = teams.find(
    (t) => t.name.replace(/\s+/g, '-').toLowerCase() === params?.name
  );
  return { props: { team } };
};

export default function TeamPage({ team }: { team: Team }) {
  if (!team) return <div>Équipe non trouvée</div>;

  // Style du bandeau (priorité à team.color si fournie)
  const bannerStyle: React.CSSProperties = team.color
    ? { background: `linear-gradient(135deg, ${team.color} 0%, rgba(255,255,255,0.08) 100%)` }
    : { background: gradientFromName(team.name) };

  return (
    <div>
      <Head>
        <title>{team.name} | OW Women's Cup</title>
        <meta name="description" content={`Fiche équipe ${team.name}`} />
      </Head>

      {/* Bandeau */}
      <section
        className="relative w-full"
        style={bannerStyle}
      >
        {/* Halo lumineux */}
        <div className="absolute inset-0 opacity-40"
             style={{ background: 'radial-gradient(60% 60% at 50% 40%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 60%)' }} />
        <div className="container mx-auto px-6 py-16 relative">
          <div className="flex flex-col items-center text-center">
            <img
              src={team.img}
              alt={team.name}
              className="w-40 h-40 object-contain rounded-2xl shadow-2xl ring-1 ring-white/20 bg-white/10 backdrop-blur-sm"
            />
            <Heading typeStyle="heading-lg" className="mt-6 text-white">
              {team.name}
            </Heading>
            <Paragraph typeStyle="body-md" className="mt-2 text-white/80">
              {team.city.join(' • ')}
            </Paragraph>
            <Link href={team.link} target="_blank" className="mt-6">
              <Button className="border border-white/40 bg-white/10 hover:bg-white/20">
                Voir la fiche sur Battlefy
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contenu principal */}
      <div className="container mx-auto px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <Heading typeStyle="heading-md" className="text-gradient">
            Roster
          </Heading>
          <Paragraph typeStyle="body-lg" className="mt-4 text-gray-200">
            {team.title}
          </Paragraph>

          {/* Optionnel : carte info */}
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
            <Heading typeStyle="heading-sm" className="text-white">
              Infos rapides
            </Heading>
            <ul className="mt-4 grid gap-3 text-gray-200">
              <li>• Nationalités : {team.city.join(', ')}</li>
              <li>• Tournoi : OW Women&apos;s Cup 2025</li>
            </ul>
          </div>

          <Link href="/" className="mt-10 inline-block text-blue-300 hover:underline">
            ← Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

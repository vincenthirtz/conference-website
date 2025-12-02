/* eslint-disable @next/next/no-img-element */
import { motion } from 'framer-motion';
import Link from 'next/link';
import teams from '@/config/teams.json';

export default function TeamsBanner() {
  const teamsWithoutPub = teams.filter((t) => !t.pub);
  return (
    <div className="sponsor-bg  text-center" data-test="sponsor-section">
      <div className="flex flex-col items-center">
        <div className="relative w-full overflow-hidden bg-gradient-to-r from-purple-900 via-blue-800 to-indigo-700 py-8 shadow-lg">
          <motion.div
            className="flex items-center gap-16 w-max"
            animate={{ x: ['0%', '-50%'] }}
            transition={{
              repeat: Infinity,
              duration: 25,
              ease: 'linear',
            }}
          >
            {[...teamsWithoutPub].map((team, index) => (
              <Link
                key={index}
                href={team.link}
                target="_blank"
                className="flex items-center justify-center"
              >
                <div className="flex flex-col items-center hover:scale-110 transition-transform duration-300">
                  <img
                    src={team.img}
                    alt={team.name}
                    className="h-16 w-auto object-contain drop-shadow-lg opacity-90 hover:opacity-100"
                  />
                  <p className="text-sm text-gray-200 mt-2 font-semibold">
                    {team.name}
                  </p>
                </div>
              </Link>
            ))}
          </motion.div>

          {/* subtle moving confetti overlay */}
          <div className="absolute inset-0 bg-[url('/img/confetti.svg')] opacity-10 animate-pulse pointer-events-none" />

          {/* gradient overlay for visual depth */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent pointer-events-none" />

          {/* Banner title */}
          {/* <h2 className="absolute top-1/2 -translate-y-1/2 left-6 text-white text-2xl lg:text-3xl font-bold drop-shadow-xl">
        ⚡ Équipes participantes
      </h2> */}
        </div>
      </div>
    </div>
  );
}

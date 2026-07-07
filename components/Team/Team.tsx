import Image from 'next/image';
import React, { JSX } from 'react';
import type { TeamProps } from '../../types/components';

function Team({ details, location, className }: TeamProps): JSX.Element {
  const accent = details.color || 'var(--color-green)';

  return (
    <div
      className={`w-auto text-center flex flex-col items-center card rounded-md p-[27px] ${className || ''}`}
      data-test="teams-section"
    >
      <div
        className="w-[300px] h-[300px] lg:w-[250px] lg:h-[250px] relative overflow-hidden rounded-full border-2 bg-gray-900"
        style={{ borderColor: accent }}
      >
        <Image
          src={details.img}
          alt={details.name}
          width={0}
          height={0}
          sizes="100vw"
          className="rounded-full object-cover transition-all duration-300 hover:scale-105 w-full h-full"
        />
      </div>
      <div className="mt-[19px] flex flex-col gap-2 text-center">
        {details.link ? (
          <a href={details.link} target="_blank" rel="noreferrer">
            <h3 className="text-[23px] text-white">{details.name}</h3>
          </a>
        ) : (
          <h3 className="text-[23px] text-white">{details.name}</h3>
        )}

        <div
          className={`flex flex-col  ${!details.title ? 'min-h-[118px]' : 'min-h-[150px]'}  justify-between`}
        >
          {details.title ? (
            <p className="text-[18px] text-gray-400">{details.title}</p>
          ) : null}
          {location && (
            <p className="mt-[6.6px] text-[20px] text-gradient">{location}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Team;

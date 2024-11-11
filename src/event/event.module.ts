import { Module } from '@nestjs/common';
import { EventService } from './event.service';
import { EventController } from './event.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { MiniGame, MiniGameSchema } from './schema/mini.schema';
import { User, UserSchema } from './schema/user.schema';
import { EConfig, EConfigSchema } from './schema/config.schema';
import { UserBet, UserBetSchema } from './schema/userBet.schema';
import { Message, MessageSchema } from './schema/message.schema';
import { Clan, ClanSchema } from './schema/clan.schema';
import { BotConfig, BotConfigSchema } from './schema/bot-config.schema';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: MiniGame.name,
        schema: MiniGameSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: EConfig.name,
        schema: EConfigSchema,
      },
      {
        name: UserBet.name,
        schema: UserBetSchema,
      },
      {
        name: Message.name,
        schema: MessageSchema,
      },
      {
        name: Clan.name,
        schema: ClanSchema,
      },
      {
        name: BotConfig.name,
        schema: BotConfigSchema,
      },
    ]),
    HttpModule,
  ],
  providers: [EventService],
  controllers: [EventController],
  exports: [],
})
export class EventModule {}

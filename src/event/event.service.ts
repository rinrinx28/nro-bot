import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment';
import { Model } from 'mongoose';
import { Clan } from './schema/clan.schema';
import { Message } from './schema/message.schema';
import { MiniGame } from './schema/mini.schema';
import { User } from './schema/user.schema';
import { UserActive } from './schema/userActive.schema';
import { BotConfig } from './schema/bot-config.schema';
import { EConfig } from './schema/config.schema';
import { OnEvent } from '@nestjs/event-emitter';
import { UserBet } from './schema/userBet.schema';
import { HttpService } from '@nestjs/axios';

interface ConfigServer {
  min: number;
  max: number;
  sum: number;
  enable: boolean;
  timePause: number;
  max_g: number;
}
interface PlaceField {
  uid: string;
  place: string;
  typeBet: string;
  amount: number;
  server: string;
  betId: string;
}

@Injectable()
export class EventService {
  constructor(
    @InjectModel(User.name)
    private readonly UserModel: Model<User>,
    @InjectModel(MiniGame.name)
    private readonly MiniGameModel: Model<MiniGame>,
    @InjectModel(EConfig.name)
    private readonly EConfigModel: Model<EConfig>,
    @InjectModel(BotConfig.name)
    private readonly BotConfigModel: Model<BotConfig>,
    @InjectModel(UserBet.name)
    private readonly UserBetModel: Model<UserBet>,
    private readonly httpService: HttpService,
  ) {}

  private logger: Logger = new Logger('Bot Auto');
  private max_bet_of_bot: number = 6; // ? Bot can bet max is 6 of 12 Server
  private list_server_client: string[] = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '11',
    '12',
    '13',
  ]; // ? List server client is available

  private place_bet_cl: string[] = ['C', 'L', 'T', 'X'];
  private place_bet_x: string[] = ['CT', 'CX', 'LT', 'LX'];
  private type_place: string[] = ['cl', 'x'];
  private url_server = 'http://localhost:3037';

  // TODO Get Config Rule Bet Of Server
  async get_config_server(
    server: string,
    target_server: string,
  ): Promise<ConfigServer> {
    try {
      const e_bet = await this.EConfigModel.findOne({ name: 'e_bet' });
      if (!e_bet) throw new Error('Config not found!');
      const {
        min,
        max,
        max_diff,
        sum,
        sum_diff,
        max_g,
        timePause,
        enable,
        timePause24,
        enable24,
      } = e_bet.option;
      const isMain = ['24', server].includes(target_server);
      let index_sv = null;

      if (['1', '2', '3', '4', '5', '6', '7'].includes(server)) {
        index_sv = parseInt(server, 10) - 1;
      } else if (server === '8') {
        index_sv = 7;
      } else if (['11', '12', '13'].includes(server)) {
        index_sv = parseInt(server, 10) - 3;
      } else {
        index_sv = 24; // Máy chủ mặc định là 24
      }
      this.logger.log('Get config is success');
      return {
        min: min,
        max: isMain ? max : max_diff,
        sum: isMain ? sum : sum_diff,
        max_g,
        timePause: server === '24' ? timePause24 : timePause[index_sv],
        enable: server === '24' ? enable24 : enable[index_sv],
      };
    } catch (err: any) {
      throw new Error(err.message);
    }
  }

  // TODO Find server for auto Bet
  async find_server_available(server: string) {
    try {
      const miniBet = await this.MiniGameModel.findOne({
        server,
        isEnd: false,
      });
      if (!miniBet) throw new Error('Minigame not found');
      return miniBet;
    } catch (err: any) {
      throw new Error(err.message);
    }
  }

  // TODO Handler Error
  error_custom(err: any) {
    this.logger.log(`Err: ${err.message}`);
  }

  // TODO Get List Bot is Available
  async get_all_bot_info() {
    try {
      const bots = await this.BotConfigModel.find({ isAvailable: true });
      return bots;
    } catch (err: any) {
      throw new Error(err.message);
    }
  }

  // TODO Change String to Number Format
  number_format(number: any) {
    return new Intl.NumberFormat('vi').format(number);
  }

  // TODO Isvalidata server bet
  async isvalidata_server(
    config_server: ConfigServer,
    game_info: MiniGame,
    amount: number,
    uid: string,
    betId: string,
  ) {
    const { enable, max, min, sum, timePause } = config_server;
    const { isEnd, timeEnd } = game_info;
    if (isEnd) throw new Error('The game is stop');

    // Check time bet
    let time_end_isodate = timeEnd;
    let time_end = moment(`${time_end_isodate}`).unix();
    let current_time = moment().unix();
    let time_late = time_end - current_time;
    if (time_late <= 0) throw new Error('Time bet is stop');
    if (time_late < timePause) throw new Error('Time bet is stop');

    // Check bet is available
    if (!enable) throw new Error('The game is close');

    // Config number format
    let n_min = this.number_format(min);
    let n_max = this.number_format(max);
    let n_sum = this.number_format(sum);

    // Check bet amount with rule
    if (amount < min) throw new Error(`Amount is than more ${n_min}`);
    if (amount > max) throw new Error(`Amount is not than more ${n_max}`);
    // Check Total User Bet in the server
    let total_userBet = await this.UserBetModel.find({
      uid: uid,
      betId: betId,
      isEnd: false,
      server: '24',
    });
    let sum_userBet = total_userBet.reduce(
      (sum, a) => sum + (a.amount ?? 0),
      0,
    );
    if (amount + sum_userBet > sum)
      throw new Error(`Amount is not than more ${n_sum}`);

    return true;
  }

  // TODO Get Random Time Bet
  getRandomNumberInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // TODO Get Random Amount Bet
  getRandomNumberInRange_a(
    min: number,
    max: number,
    roundingFactor: number,
  ): number {
    const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
    return Math.round(randomValue / roundingFactor) * roundingFactor;
  }

  // TODO Get Random Place
  randomize_bet_place(type: 'cl' | 'x'): string {
    if (type === 'cl') {
      const randomIndex = Math.floor(Math.random() * this.place_bet_cl.length);
      return this.place_bet_cl[randomIndex];
    } else {
      const randomIndex = Math.floor(Math.random() * this.place_bet_x.length);
      return this.place_bet_x[randomIndex];
    }
  }

  // TODO Get Random Type Place
  randomize_bet_type_place(): string {
    const randomIndex = Math.floor(Math.random() * this.type_place.length);
    return this.type_place[randomIndex];
  }

  // TODO Shuffle and pick random half of the bots
  getRandomBotsForBet(bots: any[]) {
    const shuffledBots = bots.sort(() => Math.random() - 0.5);
    const halfBots = Math.ceil(shuffledBots.length / 2);
    return shuffledBots.slice(0, halfBots);
  }

  // TODO Compare them to the current hour
  isCurrentTimeInRange(range: string) {
    const [start, end] = range.split('-').map(Number);
    const currentHour = new Date().getHours();

    return currentHour >= start && currentHour < end;
  }

  // TODO Call API to Main Server
  async place_bet_on_server(data: PlaceField) {
    try {
      await this.httpService.axiosRef.post(
        this.url_server + '/mini-game/v2/place',
        data,
      );
    } catch (err: any) {
      console.log(err);
      this.logger.log(`Err place bet Auto: ${err.message}`);
    }
  }

  // TODO Start Bot Sv 24
  @OnEvent('start.bot.24', { async: true })
  async start_bot_24() {
    try {
      // Get Config auto
      const e_s_bet = await this.EConfigModel.findOne({ name: 'e_s_bet' });
      if (!e_s_bet) throw new Error('Config system bet not found');
      if (!e_s_bet.isEnable) throw new Error('Auto bot is disable');
      if (!e_s_bet.option.sv_24) throw new Error('Auto bot sv 24 is disable');
      // Get list bots
      const list_bots = await this.get_all_bot_info();
      //   Get game info
      const game_info = await this.find_server_available('24');
      if (!game_info) throw new Error('Minigame not found');
      //   Get config server
      const config_server = await this.get_config_server('24', '24');
      // Find bot isvalidata for auto bet
      const list_filter_bots: { data: PlaceField; time: number }[] = [];
      for (const bot of list_bots) {
        const { uid, meta, isAvailable } = bot;
        const { active, TotalTrade } = meta;
        const target = await this.UserModel.findById(uid);
        const target_totalTrade = target.meta.totalTrade;
        const { max, min } = config_server;
        let current_time = moment().unix();
        // Let get time
        let time_end_isodate = game_info.timeEnd;
        let time_end = moment(`${time_end_isodate}`).unix();
        let time_late = time_end - current_time;

        // let check config range time of a bot
        let isRange = this.isCurrentTimeInRange(active);

        if (!isRange) {
          this.logger.log(`Skip placing bet: out range time active ${active}`);
          // If the time current is less than time range, skip placing a bet
          continue;
        }

        if (!isAvailable) {
          this.logger.log('Skip placing bet: Bot not is available');
          // If the bot not is available, skip placing a bet
          continue;
        }

        if (time_late < 10) {
          this.logger.log('Skip placing bet, the bet is stop');
          // If the remaining time is less than 10 seconds, skip placing a bet
          continue;
        }

        if (target_totalTrade > TotalTrade) {
          this.logger.log('Skip placing bet, out range totalTrade today');
          // If the totalTrade of bot more than TotalTrade Config, skip placing a bet
          continue;
        }

        // Generate random time for the bot to place a bet (between 50s and 20s before time ends)
        let time_bet = this.getRandomNumberInRange(
          time_late - 50,
          time_late - 15,
        );
        let amount = this.getRandomNumberInRange_a(min, max, 1e6);
        let type_place = this.randomize_bet_type_place();
        let place = this.randomize_bet_place(type_place as 'cl' | 'x');

        list_filter_bots.push({
          data: {
            uid: uid,
            amount: amount,
            betId: game_info.id,
            place: place,
            server: '24',
            typeBet: type_place,
          },
          time: time_bet * 1e3,
        });
      }

      const list_bot_random_place: { data: PlaceField; time: number }[] =
        this.getRandomBotsForBet(list_filter_bots);
      for (const place of list_bot_random_place) {
        const { data, time } = place;
        setTimeout(async () => {
          await this.place_bet_on_server(data);
          this.logger.log(
            `Bot: ${data.uid} has place: ${data.place} - BetId: ${data.betId}`,
          );
        }, time);
      }
      this.logger.log(`Place bet auto server 24`);
    } catch (err: any) {
      this.error_custom(err);
    }
  }

  @OnEvent('start.bot.client', { async: true })
  async start_bot_client() {
    try {
      // Get Config auto
      const e_s_bet = await this.EConfigModel.findOne({ name: 'e_s_bet' });
      if (!e_s_bet) throw new Error('Config system bet not found');
      if (!e_s_bet.isEnable) throw new Error('Auto bot is disabled');
      if (!e_s_bet.option.sv_game)
        throw new Error('Auto bot sv game is disabled');

      // Get list bots and available servers
      const [list_bots, list_server_available] = await Promise.all([
        this.get_all_bot_info(),
        this.MiniGameModel.find({
          server: { $in: this.list_server_client },
          isEnd: false,
        }),
      ]);

      // Process each game server
      for (const game_info of list_server_available) {
        const { id: betId, timeEnd, server } = game_info;

        const list_filter_bots: { data: PlaceField; time: number }[] = [];
        const current_time = moment().unix();
        const time_end = moment(`${timeEnd}`).unix();
        const time_late = time_end - current_time;

        if (time_late < 10) {
          this.logger.log(
            `Skipping betting on server ${server}: insufficient remaining time`,
          );
          continue;
        }

        // Filter and prepare bots eligible for betting
        for (const bot of list_bots) {
          const { uid, meta, isAvailable } = bot;
          const { active, TotalTrade } = meta;

          if (!this.isCurrentTimeInRange(active)) {
            this.logger.log(
              `Skip placing bet for bot ${uid}: out of active time range (${active})`,
            );
            continue;
          }

          if (!isAvailable) {
            this.logger.log(`Skip placing bet for bot ${uid}: not available`);
            continue;
          }

          const target = await this.UserModel.findById(uid);
          if (!target) {
            this.logger.log(
              `Skip placing bet for bot ${uid}: target user not found`,
            );
            continue;
          }

          const target_totalTrade = target.meta.totalTrade;
          if (target_totalTrade > TotalTrade) {
            this.logger.log(
              `Skip placing bet for bot ${uid}: daily trade limit exceeded`,
            );
            continue;
          }

          // Generate betting details
          const config_server = await this.get_config_server(
            server,
            target.server,
          );
          const { max, min } = config_server;
          const time_bet = this.getRandomNumberInRange(
            time_late - 50,
            time_late - 15,
          );
          const amount = this.getRandomNumberInRange_a(min, max, 1e6);
          const type_place = this.randomize_bet_type_place();
          const place = this.randomize_bet_place(type_place as 'cl' | 'x');

          list_filter_bots.push({
            data: {
              uid,
              amount,
              betId,
              place,
              server: server,
              typeBet: type_place,
            },
            time: time_bet * 1000,
          });
        }

        // Select random bots to place bets and execute with delay
        const list_bot_random_place =
          this.getRandomBotsForBet(list_filter_bots);
        for (const { data, time } of list_bot_random_place) {
          setTimeout(async () => {
            await this.place_bet_on_server(data);
            this.logger.log(
              `Bot ${data.uid} placed bet ${data.place} on BetId ${data.betId}`,
            );
          }, time);
        }

        this.logger.log(`Auto bets placed on server ${server}`);
      }
    } catch (err: any) {
      this.error_custom(err);
    }
  }
}

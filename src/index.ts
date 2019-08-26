import fs from 'fs';
import util from 'util';
import {
  ColumnError,
  CsvError,
  LasError,
  PathError,
  PropertyError
} from './error';
import isNode from './isnode';
let fsprom: any;

if (isNode) {
  fsprom = util.promisify(fs.readFile);
}

interface IWellProp {
  [key: string]: { unit: string; value: string; description: string };
}

export default class Lasjs {
  private static chunk<T>(arr: T[], size: number): T[][] {
    const overall = [];
    let index = 0;
    while (index < arr.length) {
      overall.push(arr.slice(index, index + size));
      index += size;
    }
    return overall;
  }

  private static removeComment(str: string) {
    return str
      .trim()
      .split('\n')
      .map(val => val.trimLeft())
      .filter(f => !(f.charAt(0) === '#'))
      .join('\n');
  }
  private static convertToValue(s: string): number | string {
    return Boolean(+s) ? +s : s;
  }

  public path: string | Blob;
  public blob: Promise<string | undefined>;

  constructor(path: string) {
    this.path = path;
    this.blob = this.initialize();
  }

  /**
   * Returns a column in a las file
   * @param {string} column - name of column
   * @returns {(Promise<Array<string| number>>)}
   * @memberof Lasjs
   */
  public async column(str: string): Promise<Array<string | number>> {
    try {
      const hds = await this.header();
      const sB = await this.data();
      const index = hds!.findIndex(item => item === str);
      if (index < 0) {
        throw new ColumnError(str);
      }
      return sB!.map(c => c[index]);
    } catch (error) {
      throw new LasError('Error getting column: ' + error);
    }
  }

  /**
   * Returns a column in a las file stripped off null values
   * @param {string} column - name of column
   * @returns {(Promise<Array<string| number>>)}
   * @memberof Lasjs
   */
  public async columnStripped(column: string): Promise<Array<string | number>> {
    try {
      const hds = await this.header();
      const sB = await this.dataStripped();
      const index = hds!.findIndex(item => item === column);
      if (index >= 0) {
        return sB!.map(c => c[index]);
      } else {
        throw new ColumnError(column);
      }
    } catch (error) {
      throw new LasError('Error getting column: ' + error);
    }
  }

  /**
   * Returns a csv File object in browser and writes csv file to current working driectory in Node
   * @param {string} filename
   * @returns {(Promise<File | void>)}
   * @memberof Lasjs
   */
  public async toCsv(filename: string = 'file'): Promise<File | void> {
    try {
      const headers = await this.header();
      const data = await this.data();
      const rHd = headers.join(',') + '\n';
      const rData = data.map(d => d.join(',')).join('\n');
      if (isNode) {
        fs.writeFile(`${filename}.csv`, rHd + rData, 'utf8', err => {
          if (err) {
            throw new CsvError();
          }
          console.log(
            `${filename}.csv has been saved to current working directory`
          );
        });
      } else {
        const file = new File([rHd + rData], `${filename}.csv`);
        return file;
      }
    } catch (error) {
      throw new LasError("Couldn't create csv file");
    }
  }

  /**
   * Returns a csv File object in browser and writes csv file to current working driectory in Node of data stripped of null values
   * @param {string} filename
   * @returns {(Promise<File | void>)}
   * @memberof Lasjs
   */
  public async toCsvStripped(filename: string = 'file'): Promise<File | void> {
    try {
      const headers = await this.header();
      const data = await this.dataStripped();
      const rHd = headers.join(',') + '\n';
      const rData = data.map(d => d.join(',')).join('\n');
      if (!isNode) {
        const file = new File([rHd + rData], `${filename}.csv`);
        return file;
      }
      fs.writeFile(`${filename}.csv`, rHd + rData, 'utf8', err => {
        if (err) {
          throw new CsvError();
        }
        console.log(
          `${filename}.csv has been saved to current working directory`
        );
      });
    } catch (error) {
      throw new LasError("Couldn't create csv file");
    }
  }
  /**
   * Returns the number of rows in a .las file
   * @returns number
   * @memberof Lasjs
   */
  public async rowCount() {
    try {
      const l = await this.data();
      return l.length;
    } catch (error) {
      throw new LasError("Couldn't get row count: " + error);
    }
  }

  /**
   * Returns the number of columns in a .las file
   * @returns number
   * @memberof Lasjs
   */
  public async columnCount() {
    try {
      const l = await this.header();
      return l.length;
    } catch (error) {
      throw new LasError("Couldn't get column count: " + error);
    }
  }

  /**
   * Returns a two-dimensional array of data in the log
   * @returns {(Promise<Array<Array<string | number>>>)}
   * @memberof Lasjs
   */
  public async data(): Promise<Array<Array<string | number>>> {
    try {
      const s = await this.blob;
      const hds = await this.header();
      const totalheadersLength = hds.length;
      const sB = s!
        .split(/~A(?:\w*\s*)*\n/)[1]
        .trim()
        .split(/\s+/)
        .map(m => Lasjs.convertToValue(m.trim()));
      const con = Lasjs.chunk(sB, totalheadersLength);
      return con;
    } catch (error) {
      throw new LasError("Couldn't get read data: " + error);
    }
  }

  /**
   * Returns a two-dimensional array of data in the log with all rows containing null values stripped off
   * @returns {(Promise<Array<Array<string | number>>>)}
   * @memberof Lasjs
   */
  public async dataStripped(): Promise<Array<Array<string | number>>> {
    try {
      const s = await this.blob;
      const hds = await this.header();
      const well: any = await this.property('well');
      const nullValue = well.NULL.value;
      const totalheadersLength = hds.length;
      const sB = s!
        .split(/~A(?:\w*\s*)*\n/)[1]
        .trim()
        .split(/\s+/)
        .map(m => Lasjs.convertToValue(m.trim()));
      const con = Lasjs.chunk(sB, totalheadersLength);
      const filtered = con.filter(f => !f.some(x => x === +nullValue));
      return filtered;
    } catch (error) {
      throw new LasError("Couldn't get read data: " + error);
    }
  }

  /**
   * Returns the version number of the las file
   * @returns {Promise<number>}
   * @memberof Lasjs
   */
  public async version(): Promise<number> {
    try {
      const v = await this.metadata();
      return +v[0];
    } catch (error) {
      throw new LasError("Couldn't get version: " + error);
    }
  }

  /**
   * Returns true if the las file is of wrapped variant and false otherwise
   * @returns {Promise<boolean>}
   * @memberof Lasjs
   */
  public async wrap(): Promise<boolean> {
    try {
      const v = await this.metadata();
      return !!v[1];
    } catch (error) {
      throw new LasError("Couldn't get wrap: " + error);
    }
  }

  /**
   * Returns an extra info about the well stored in ~others section
   * @returns {Promise<string>}
   * @memberof Lasjs
   */
  public async other(): Promise<string> {
    try {
      const s = await this.blob;
      const som = s!.split(/~O(?:\w*\s*)*\n\s*/i)[1];
      let str = '';
      if (som) {
        const some = som
          .split('~')[0]
          .replace(/\n\s*/g, ' ')
          .trim();
        str = Lasjs.removeComment(some);
      }
      if (str.length <= 0) {
        throw new LasError('No other metadata');
      }
      return str;
    } catch (error) {
      throw new LasError("Couldn't get other metadata: " + error);
    }
  }

  /**
   * Returns an array of strings of the logs header/title
   * @returns {Promise<string[]>}
   * @memberof Lasjs
   */
  public async header(): Promise<string[]> {
    try {
      const s = await this.blob;
      const sth = s!.split(/~C(?:\w*\s*)*\n\s*/)[1].split('~')[0];
      const uncommentedSth = Lasjs.removeComment(sth).trim();
      return uncommentedSth.split('\n').map(m => m.trim().split(/\s+|[.]/)[0]);
    } catch (error) {
      throw new LasError("Couldn't get the header: " + error);
    }
  }

  /**
   * Returns an object each well header and description as a key-value pair
   * @returns {Promise<{[key:string]: string}>}
   * @memberof Lasjs
   */
  public async headerAndDescr(): Promise<{
    [key: string]: string;
  }> {
    try {
      const cur = (await this.property('curve')) as object;
      const hd = Object.keys(cur);
      const descr = Object.values(cur).map(c => c.description);
      const obj: { [key: string]: string } = {};
      hd.map((_, i) => (obj[hd[i]] = descr[i]));
      return obj;
    } catch (error) {
      throw new LasError("Couldn't get the header: " + error);
    }
  }

  /**
   * Returns details of  well parameters.
   * @returns {Promise<IWellProp>}
   * @memberof Lasjs
   */
  public async wellParams(): Promise<IWellProp> {
    return this.property('well');
  }

  /**
   * Returns details of  curve parameters.
   * @returns {Promise<IWellProp>}
   * @memberof Lasjs
   */
  public async curveParams(): Promise<IWellProp> {
    return this.property('curve');
  }

  /**
   * Returns details of  parameters of the well.
   * @returns {Promise<IWellProp>}
   * @memberof Lasjs
   */
  public async logParams(): Promise<IWellProp> {
    return this.property('param');
  }

  private async metadata() {
    try {
      const str = await this.blob;
      const sB = str!
        .trim()
        .split(/~V(?:\w*\s*)*\n\s*/)[1]
        .split(/~/)[0];
      const sw = Lasjs.removeComment(sB);
      const refined = sw
        .split('\n')
        .map(m => m.split(/\s{2,}|\s*:/).slice(0, 2))
        .filter(f => Boolean(f));
      const res = refined.map(r => r[1]);
      const wrap = res[1].toLowerCase() === 'yes' ? true : false;
      return [res[0], wrap];
    } catch (error) {
      throw new LasError("Couldn't get metadata: " + error);
    }
  }

  private async property(p: string) {
    try {
      const regDict: { [key: string]: string } = {
        curve: '~C(?:\\w*\\s*)*\\n\\s*',
        param: '~P(?:\\w*\\s*)*\\n\\s*',
        well: '~W(?:\\w*\\s*)*\\n\\s*'
      };
      const regExp = new RegExp(regDict[p], 'i');
      const str = await this.blob;
      const substr = str!.split(regExp);
      let sw = '';
      if (substr.length > 1) {
        const res = substr[1].split(/~/)[0];
        sw = Lasjs.removeComment(res);
      }
      if (sw.length > 0) {
        const s: IWellProp = {};
        sw.split('\n').map(c => {
          const obj = c.replace(/\s*[.]\s+/, '   none   ');
          const title = obj.split(/[.]|\s+/)[0];
          const unit = obj
            .trim()
            .split(/^\w+\s*[.]*s*/)[1]
            .split(/\s+/)[0];
          const description = Boolean(obj.split(/[:]/)[1].trim())
            ? obj.split(/[:]/)[1].trim()
            : 'none';
          const third = obj.split(/[:]/)[0].split(/\s{2,}\w*\s{2,}/);
          const value =
            third.length > 2 && !Boolean(third[third.length - 1])
              ? third[third.length - 2]
              : third[third.length - 1];
          s[title] = { unit, value, description };
        });
        return s;
      } else {
        throw new PropertyError(p);
      }
    } catch (error) {
      throw new LasError("Couldn't get the property: " + error);
    }
  }

  private async initialize(): Promise<string | undefined> {
    if (isNode) {
      try {
        const str = await fsprom(this.path as string, 'utf8');
        return str;
      } catch (error) {
        throw new PathError();
      }
    } else {
      if (this.path instanceof File) {
        const reader = new FileReader();
        reader.readAsText(this.path as Blob);
        reader.onload = () => {
          return reader.result;
        };
        reader.onerror = () => {
          throw new PathError();
        };
      } else {
        try {
          const val = await fetch(this.path as string);
          const text = await val.text();
          return text;
        } catch (error) {
          throw new PathError();
        }
      }
    }
  }
}
